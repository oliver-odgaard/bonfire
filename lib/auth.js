import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { Pool } from 'pg';
import { getSupabaseAdmin } from './supabase-admin';

// Shared Postgres pool — used by Better Auth and our direct workspace lookups.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const socialProviders = {};
if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
  socialProviders.slack = {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  database: pool,
  socialProviders,
  plugins: [
    organization({
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org, user }) => {
          await mirrorMembership(user, org);
        },
        afterAddMember: async ({ user, organization: org }) => {
          await mirrorMembership(user, org);
        },
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: { after: async (user) => { await mirrorUser(user); } },
      update: { after: async (user) => { await mirrorUser(user); } },
    },
    account: {
      create: { after: async (account) => { await autoAssociateWorkspace(account); } },
    },
  },
});

async function mirrorUser(user) {
  try {
    const db = getSupabaseAdmin();
    await db.from('users').upsert(
      {
        auth_user_id: user.id,
        name: user.name || user.email || 'Unknown',
        avatar_url: user.image || null,
      },
      { onConflict: 'auth_user_id' }
    );
  } catch (err) {
    console.error('[auth] mirrorUser failed:', err);
  }
}

async function mirrorMembership(user, org) {
  try {
    const db = getSupabaseAdmin();
    await db.from('users').upsert(
      {
        auth_user_id: user.id,
        name: user.name || user.email || 'Unknown',
        avatar_url: user.image || null,
        company: org.slug,
      },
      { onConflict: 'auth_user_id' }
    );
  } catch (err) {
    console.error('[auth] mirrorMembership failed:', err);
  }
}

// Decode a JWT payload without verifying — Better Auth has already verified the
// idToken at this point; we only need the claims.
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// When a user signs in via a workspace provider (Slack OIDC, Google Workspace),
// look up an org for their workspace and add them — or create one and make them
// the owner if it's the first time anyone from that workspace has signed in.
async function autoAssociateWorkspace(account) {
  try {
    if (!account.idToken) return;
    const claims = decodeJwt(account.idToken);
    if (!claims) return;

    if (account.providerId === 'slack') {
      const teamId = claims['https://slack.com/team_id'];
      if (!teamId) return;
      const teamName = claims['https://slack.com/team_name'] || 'My Workspace';
      const teamDomain = claims['https://slack.com/team_domain'] || teamName;
      await ensureOrgMembership({
        userId: account.userId,
        workspaceKey: 'slackTeamId',
        workspaceId: teamId,
        orgName: teamName,
        orgSlugBase: teamDomain,
        extraMetadata: { slackTeamDomain: teamDomain },
      });
      return;
    }

    if (account.providerId === 'google') {
      // `hd` is the Google Workspace hosted domain. Personal @gmail.com accounts
      // won't have it — those users sign in but stay outside any org.
      const hd = claims.hd;
      if (!hd) return;
      const orgName = hd.split('.')[0];
      await ensureOrgMembership({
        userId: account.userId,
        workspaceKey: 'googleHostedDomain',
        workspaceId: hd,
        orgName,
        orgSlugBase: orgName,
      });
      return;
    }
  } catch (err) {
    console.error('[auth] autoAssociateWorkspace failed:', err);
  }
}

async function ensureOrgMembership({
  userId,
  workspaceKey,
  workspaceId,
  orgName,
  orgSlugBase,
  extraMetadata,
}) {
  const existing = await pool.query(
    `SELECT id, slug FROM organization WHERE metadata::jsonb->>$1 = $2 LIMIT 1`,
    [workspaceKey, workspaceId]
  );

  if (existing.rows.length > 0) {
    const orgId = existing.rows[0].id;
    // Skip if already a member.
    const memberCheck = await pool.query(
      `SELECT 1 FROM member WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1`,
      [orgId, userId]
    );
    if (memberCheck.rows.length > 0) return;
    await auth.api.addMember({
      body: { userId, role: 'member', organizationId: orgId },
    });
    return;
  }

  const slug = await uniqueSlug(orgSlugBase);
  await auth.api.createOrganization({
    body: {
      name: orgName,
      slug,
      metadata: { [workspaceKey]: workspaceId, ...(extraMetadata || {}) },
      userId,
    },
  });
}

async function uniqueSlug(base) {
  const cleaned = (base || 'org')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'org';
  let candidate = cleaned;
  let i = 1;
  // Walk until we find a free slug.
  // Slugs are globally unique in Better Auth's organization table.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await pool.query(`SELECT 1 FROM organization WHERE slug = $1`, [candidate]);
    if (res.rows.length === 0) return candidate;
    i += 1;
    candidate = `${cleaned}-${i}`;
  }
}
