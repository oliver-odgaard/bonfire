// Adapted from https://github.com/charlieclark/thiings-grid (MIT)
// Copyright (c) 2025 Charlie Clark
import React, { Component } from "react";

const MIN_VELOCITY = 0.05;
const UPDATE_INTERVAL = 16;
const VELOCITY_HISTORY_SIZE = 5;
const FRICTION = 0.997;
const VELOCITY_SCALE = 16;

function debounce(func, wait) {
  let timeoutId;
  const debouncedFn = function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = undefined;
    }, wait);
  };
  debouncedFn.cancel = function () {
    clearTimeout(timeoutId);
    timeoutId = undefined;
  };
  return debouncedFn;
}

function throttle(func, limit, options = {}) {
  let lastCall = 0;
  let timeoutId;
  const { leading = true, trailing = true } = options;
  const throttledFn = function (...args) {
    const now = Date.now();
    if (!lastCall && !leading) lastCall = now;
    const remaining = limit - (now - lastCall);
    if (remaining <= 0 || remaining > limit) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      lastCall = now;
      func(...args);
    } else if (!timeoutId && trailing) {
      timeoutId = setTimeout(() => {
        lastCall = leading ? Date.now() : 0;
        timeoutId = undefined;
        func(...args);
      }, remaining);
    }
  };
  throttledFn.cancel = function () {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };
  return throttledFn;
}

function getDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

class ThiingsGrid extends Component {
  constructor(props) {
    super(props);
    const offset = this.props.initialPosition || { x: 0, y: 0 };
    this.state = {
      offset: { ...offset },
      restPos: { ...offset },
      startPos: { ...offset },
      velocity: { x: 0, y: 0 },
      isDragging: false,
      gridItems: [],
      isMoving: false,
      lastMoveTime: 0,
      velocityHistory: [],
    };
    this.containerRef = React.createRef();
    this.lastPos = { x: 0, y: 0 };
    this.animationFrame = null;
    this.isComponentMounted = false;
    this.lastUpdateTime = 0;
    this.cachedWidth = 0;
    this.cachedHeight = 0;
    this.lastGridCenter = { x: Infinity, y: Infinity };
    this.debouncedUpdateGridItems = throttle(
      this.updateGridItems,
      UPDATE_INTERVAL,
      { leading: true, trailing: true }
    );
  }

  componentDidMount() {
    this.isComponentMounted = true;
    this.cacheContainerSize();
    this.updateGridItems();

    if (this.containerRef.current) {
      this.containerRef.current.addEventListener("wheel", this.handleWheel, {
        passive: false,
      });
      this.containerRef.current.addEventListener(
        "touchmove",
        this.handleTouchMove,
        { passive: false }
      );
    }

    window.addEventListener("resize", this.handleResize);
  }

  componentWillUnmount() {
    this.isComponentMounted = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.debouncedUpdateGridItems.cancel();
    this.debouncedStopMoving.cancel();

    window.removeEventListener("resize", this.handleResize);

    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener("wheel", this.handleWheel);
      this.containerRef.current.removeEventListener(
        "touchmove",
        this.handleTouchMove
      );
    }
  }

  cacheContainerSize = () => {
    if (this.containerRef.current) {
      const rect = this.containerRef.current.getBoundingClientRect();
      this.cachedWidth = rect.width;
      this.cachedHeight = rect.height;
    }
  };

  handleResize = () => {
    this.cacheContainerSize();
    this.lastGridCenter = { x: Infinity, y: Infinity };
    this.updateGridItems();
  };

  publicGetCurrentPosition = () => this.state.offset;

  publicPanBy = (delta) => {
    if (this.state.isDragging) return;
    this.setState(
      (prev) => ({
        offset: { x: prev.offset.x + delta.x, y: prev.offset.y + delta.y },
      }),
      this.debouncedUpdateGridItems
    );
  };

  calculateVisiblePositions = () => {
    const width = this.cachedWidth;
    const height = this.cachedHeight;
    if (width === 0 && height === 0) return null;

    const centerX = -Math.round(this.state.offset.x / this.props.gridSize);
    const centerY = -Math.round(this.state.offset.y / this.props.gridSize);

    if (
      centerX === this.lastGridCenter.x &&
      centerY === this.lastGridCenter.y
    ) {
      return null;
    }
    this.lastGridCenter = { x: centerX, y: centerY };

    const cellsX = Math.ceil(width / this.props.gridSize);
    const cellsY = Math.ceil(height / this.props.gridSize);

    const positions = [];
    const halfCellsX = Math.ceil(cellsX / 2);
    const halfCellsY = Math.ceil(cellsY / 2);

    for (let y = centerY - halfCellsY; y <= centerY + halfCellsY; y++) {
      for (let x = centerX - halfCellsX; x <= centerX + halfCellsX; x++) {
        positions.push({ x, y });
      }
    }
    return positions;
  };

  getItemIndexForPosition = (x, y) => {
    if (x === 0 && y === 0) return 0;
    const layer = Math.max(Math.abs(x), Math.abs(y));
    const innerLayersSize = Math.pow(2 * layer - 1, 2);
    let positionInLayer = 0;
    if (y === 0 && x === layer) {
      positionInLayer = 0;
    } else if (y < 0 && x === layer) {
      positionInLayer = -y;
    } else if (y === -layer && x > -layer) {
      positionInLayer = layer + (layer - x);
    } else if (x === -layer && y < layer) {
      positionInLayer = 3 * layer + (layer + y);
    } else if (y === layer && x < layer) {
      positionInLayer = 5 * layer + (layer + x);
    } else {
      positionInLayer = 7 * layer + (layer - y);
    }
    return innerLayersSize + positionInLayer;
  };

  debouncedStopMoving = debounce(() => {
    this.setState({ isMoving: false, restPos: { ...this.state.offset } });
  }, 200);

  updateGridItems = () => {
    if (!this.isComponentMounted) return;

    const positions = this.calculateVisiblePositions();
    if (positions === null) {
      const distanceFromRest = getDistance(
        this.state.offset,
        this.state.restPos
      );
      const isMoving = distanceFromRest > 5;
      if (isMoving !== this.state.isMoving) this.setState({ isMoving });
      this.debouncedStopMoving();
      return;
    }

    const newItems = positions.map((position) => ({
      position,
      gridIndex: this.getItemIndexForPosition(position.x, position.y),
    }));

    const distanceFromRest = getDistance(this.state.offset, this.state.restPos);
    this.setState({ gridItems: newItems, isMoving: distanceFromRest > 5 });
    this.debouncedStopMoving();
  };

  animate = () => {
    if (!this.isComponentMounted) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastUpdateTime;

    if (deltaTime >= UPDATE_INTERVAL) {
      const { velocity } = this.state;
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

      if (speed < MIN_VELOCITY) {
        this.setState({ velocity: { x: 0, y: 0 } });
        return;
      }

      const deceleration = Math.pow(FRICTION, deltaTime);
      const dt = deltaTime / UPDATE_INTERVAL;

      this.setState(
        (prevState) => ({
          offset: {
            x: prevState.offset.x + prevState.velocity.x * dt,
            y: prevState.offset.y + prevState.velocity.y * dt,
          },
          velocity: {
            x: prevState.velocity.x * deceleration,
            y: prevState.velocity.y * deceleration,
          },
        }),
        this.debouncedUpdateGridItems
      );

      this.lastUpdateTime = currentTime;
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  };

  handleDown = (p) => {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.setState({
      isDragging: true,
      startPos: { x: p.x - this.state.offset.x, y: p.y - this.state.offset.y },
      velocity: { x: 0, y: 0 },
      velocityHistory: [],
      lastMoveTime: performance.now(),
    });
    this.lastPos = { x: p.x, y: p.y };
  };

  handleMove = (p) => {
    if (!this.state.isDragging) return;

    const currentTime = performance.now();
    const timeDelta = currentTime - this.state.lastMoveTime;

    const rawVelocity = {
      x: (p.x - this.lastPos.x) / (timeDelta || 1),
      y: (p.y - this.lastPos.y) / (timeDelta || 1),
    };

    const velocityHistory = [...this.state.velocityHistory, rawVelocity];
    if (velocityHistory.length > VELOCITY_HISTORY_SIZE) velocityHistory.shift();

    let totalWeight = 0;
    const smoothedVelocity = velocityHistory.reduce(
      (acc, vel, i) => {
        const weight = Math.pow(2, i);
        totalWeight += weight;
        return { x: acc.x + vel.x * weight, y: acc.y + vel.y * weight };
      },
      { x: 0, y: 0 }
    );
    smoothedVelocity.x /= totalWeight;
    smoothedVelocity.y /= totalWeight;

    this.setState(
      {
        velocity: smoothedVelocity,
        offset: {
          x: p.x - this.state.startPos.x,
          y: p.y - this.state.startPos.y,
        },
        lastMoveTime: currentTime,
        velocityHistory,
      },
      this.updateGridItems
    );
    this.lastPos = { x: p.x, y: p.y };
  };

  handleUp = () => {
    const timeSinceLastMove = performance.now() - this.state.lastMoveTime;
    const velocity =
      timeSinceLastMove > 100
        ? { x: 0, y: 0 }
        : {
            x: this.state.velocity.x * VELOCITY_SCALE,
            y: this.state.velocity.y * VELOCITY_SCALE,
          };
    this.lastUpdateTime = performance.now();
    this.setState({ isDragging: false, velocity });
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  handleMouseDown = (e) => {
    this.handleDown({ x: e.clientX, y: e.clientY });
  };

  handleMouseMove = (e) => {
    e.preventDefault();
    this.handleMove({ x: e.clientX, y: e.clientY });
  };

  handleMouseUp = () => this.handleUp();

  handleTouchStart = (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    this.handleDown({ x: touch.clientX, y: touch.clientY });
  };

  handleTouchMove = (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    this.handleMove({ x: touch.clientX, y: touch.clientY });
  };

  handleTouchEnd = () => this.handleUp();

  handleWheel = (e) => {
    e.preventDefault();
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;
    this.setState(
      (prevState) => ({
        offset: {
          x: prevState.offset.x - deltaX,
          y: prevState.offset.y - deltaY,
        },
        velocity: { x: 0, y: 0 },
      }),
      this.debouncedUpdateGridItems
    );
  };

  render() {
    const { offset, isDragging, gridItems, isMoving } = this.state;
    const { gridSize, className } = this.props;

    const containerWidth = this.cachedWidth;
    const containerHeight = this.cachedHeight;

    return (
      <div
        ref={this.containerRef}
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          touchAction: "none",
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={this.handleMouseDown}
        onMouseMove={this.handleMouseMove}
        onMouseUp={this.handleMouseUp}
        onMouseLeave={this.handleMouseUp}
        onTouchStart={this.handleTouchStart}
        onTouchEnd={this.handleTouchEnd}
        onTouchCancel={this.handleTouchEnd}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
            willChange: "transform",
          }}
        >
          {gridItems.map((item) => {
            const x = item.position.x * gridSize + containerWidth / 2;
            const y = item.position.y * gridSize + containerHeight / 2;
            return (
              <div
                key={`${item.position.x}-${item.position.y}`}
                style={{
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                  width: gridSize,
                  height: gridSize,
                  transform: `translate3d(${x}px, ${y}px, 0)`,
                  marginLeft: `-${gridSize / 2}px`,
                  marginTop: `-${gridSize / 2}px`,
                }}
              >
                {this.props.renderItem({
                  gridIndex: item.gridIndex,
                  position: item.position,
                  isMoving,
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

export default ThiingsGrid;
