import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jajguduvbdhcvxwjrzkc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imphamd1ZHV2YmRoY3Z4d2pyemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0MzAxMDQsImV4cCI6MjA3MTAwNjEwNH0.Tgx2wlAzgEIMWVz_nWlhtUko7Q7Myp21RBf9_9nvIIQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)