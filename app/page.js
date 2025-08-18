'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const CELL_SIZE = 208; // 160px image + 48px gap
const IMAGE_SIZE = 160;
const VIEWPORT_BUFFER = 2;

// Color palette for interests
const colorPalette = [
  'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-yellow-400', 'bg-orange-500',
  'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-cyan-500',
  'bg-lime-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500',
  'bg-slate-500', 'bg-gray-500', 'bg-blue-400', 'bg-green-400', 'bg-purple-400'
];

// Icon options for interests
const iconOptions = [
  '🎨', '⚡', '🎭', '⚪', '💼', '✨', '💬', '◉', '▣', '▥',
  '▦', '☰', '◈', '🎯', '⌨', '⬢', '📖', '🔄', '🛟', '💡',
  '🚀', '🌟', '🎪', '🎸', '📱', '💻', '🎮', '📸', '🏆', '🎲'
];

export default function Home() {
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [lastPanTime, setLastPanTime] = useState(0);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [autoScrollVelocity, setAutoScrollVelocity] = useState({ x: 0, y: 0 });
  const [initialLoadItems, setInitialLoadItems] = useState(new Set());
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const autoScrollRef = useRef(null);

  // Fetch interests from Supabase
  const fetchInterests = async () => {
    try {
      const { data, error } = await supabase
        .from('interests')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching interests:', error);
        return;
      }

      // Get public URLs for images if they exist
      const interestsWithImages = await Promise.all((data || []).map(async (interest) => {
        if (interest.image_path) {
          const { data: urlData } = supabase.storage
            .from('Bonfire images')
            .getPublicUrl(interest.image_path);
          
          return {
            ...interest,
            image_url: urlData.publicUrl
          };
        }
        return interest;
      }));

      setInterests(interestsWithImages);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and real-time subscription
  useEffect(() => {
    fetchInterests();

    // Set up real-time subscription
    const channel = supabase
      .channel('interests_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'interests' 
        },
        (payload) => {
          console.log('Real-time update:', payload);
          fetchInterests(); // Refetch data when changes occur
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calculate grid dimensions based on interests count
  const getGridDimensions = () => {
    if (interests.length === 0) return { width: 6, height: 4 };
    
    // Calculate a roughly square grid
    const itemCount = interests.length;
    const width = Math.ceil(Math.sqrt(itemCount * 1.5)); // Make it slightly wider than tall
    const height = Math.ceil(itemCount / width);
    
    return { width, height };
  };

  // Convert interests to grid items
  const getGridItems = () => {
    if (interests.length === 0) return [];
    
    return interests.map((interest, index) => {
      // Assign consistent color and icon based on interest properties
      const colorIndex = (interest.id || index) % colorPalette.length;
      const iconIndex = (interest.id || index) % iconOptions.length;
      
      return {
        id: interest.id,
        title: interest.name || interest.title || `Interest ${index + 1}`,
        type: interest.type || 'interest',
        color: colorPalette[colorIndex],
        icon: iconOptions[iconIndex],
        originalData: interest
      };
    });
  };

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    setVelocity({ x: 0, y: 0 });
    setLastPanTime(Date.now());
    setLastPanPosition({ x: e.clientX, y: e.clientY });
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [panOffset]);

  // Unified mouse tracking for drag, parallax, and auto-scroll
  const updateMouseEffects = useCallback((e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate offset from center, normalized to -1 to 1
      const offsetX = (mouseX - centerX) / centerX;
      const offsetY = (mouseY - centerY) / centerY;
      
      // Apply parallax effect (move in opposite direction, scaled down)
      const parallaxStrength = isDragging ? 20 : 40; // Weaker during drag, stronger during hover
      setParallaxOffset({
        x: -offsetX * parallaxStrength,
        y: -offsetY * parallaxStrength
      });

      // Auto-scroll calculation (only when not dragging)
      if (!isDragging) {
        const edgeZone = 300; // Pixels from edge to start auto-scroll
        const maxSpeed = 8; // Maximum scroll speed
        
        let scrollX = 0;
        let scrollY = 0;
        
        // Calculate horizontal auto-scroll (follow cursor direction)
        if (mouseX < edgeZone) {
          scrollX = ((edgeZone - mouseX) / edgeZone) * maxSpeed; // Move right (following left cursor)
        } else if (mouseX > rect.width - edgeZone) {
          scrollX = -((mouseX - (rect.width - edgeZone)) / edgeZone) * maxSpeed; // Move left (following right cursor)
        }
        
        // Calculate vertical auto-scroll (follow cursor direction)
        if (mouseY < edgeZone) {
          scrollY = ((edgeZone - mouseY) / edgeZone) * maxSpeed; // Move down (following up cursor)
        } else if (mouseY > rect.height - edgeZone) {
          scrollY = -((mouseY - (rect.height - edgeZone)) / edgeZone) * maxSpeed; // Move up (following down cursor)
        }
        
        setAutoScrollVelocity({ x: scrollX, y: scrollY });
      } else {
        setAutoScrollVelocity({ x: 0, y: 0 });
      }
    }
  }, [isDragging]);

  const handleMouseMove = useCallback((e) => {
    // Always update mouse effects (parallax and auto-scroll)
    updateMouseEffects(e);
    
    if (!isDragging) return;
    
    const currentTime = Date.now();
    const deltaTime = currentTime - lastPanTime;
    
    if (deltaTime > 0) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      const deltaX = e.clientX - lastPanPosition.x;
      const deltaY = e.clientY - lastPanPosition.y;
      
      setVelocity({
        x: deltaX / deltaTime * 16,
        y: deltaY / deltaTime * 16
      });
      
      setPanOffset({ x: newX, y: newY });
      setLastPanTime(currentTime);
      setLastPanPosition({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, dragStart, lastPanTime, lastPanPosition, updateMouseEffects]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    
    const momentum = () => {
      setVelocity(prev => {
        const friction = 0.95;
        const newVel = { x: prev.x * friction, y: prev.y * friction };
        
        if (Math.abs(newVel.x) > 0.1 || Math.abs(newVel.y) > 0.1) {
          setPanOffset(prevOffset => ({
            x: prevOffset.x + newVel.x,
            y: prevOffset.y + newVel.y
          }));
          animationRef.current = requestAnimationFrame(momentum);
        }
        
        return newVel;
      });
    };
    
    if (Math.abs(velocity.x) > 1 || Math.abs(velocity.y) > 1) {
      momentum();
    }
  }, [velocity]);


  useEffect(() => {
    // Always listen for mouse move for parallax
    document.addEventListener('mousemove', handleMouseMove);
    
    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);


  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isModalOpen]);

  // Auto-scroll animation loop
  useEffect(() => {
    const autoScroll = () => {
      if (!isDragging && (autoScrollVelocity.x !== 0 || autoScrollVelocity.y !== 0)) {
        setPanOffset(prev => ({
          x: prev.x + autoScrollVelocity.x,
          y: prev.y + autoScrollVelocity.y
        }));
      }
      autoScrollRef.current = requestAnimationFrame(autoScroll);
    };

    autoScrollRef.current = requestAnimationFrame(autoScroll);

    return () => {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
      }
    };
  }, [autoScrollVelocity, isDragging]);

  // Trigger initial pop-in animations on page load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const visibleCells = getVisibleCells();
        visibleCells.forEach(({ x, y }) => {
          const item = getItemForPosition(x, y);
          const itemKey = `${x}-${y}`;
          
          if (item) {
            // No delay - immediate animation
            const delay = 0;
            setTimeout(() => {
              setInitialLoadItems(prev => new Set([...prev, itemKey]));
            }, delay);
          }
        });
        
        // Mark initial load as complete after all animations have had time to trigger
        setTimeout(() => {
          setIsInitialLoadComplete(true);
        }, 300); // Allow all initial animations to complete
      }
    }, 50); // Small delay to ensure component is mounted

    return () => clearTimeout(timer);
  }, []);

  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedItem(null), 300); // Delay to allow exit animation
  };

  const getVisibleCells = () => {
    if (!containerRef.current) return [];
    
    const rect = containerRef.current.getBoundingClientRect();
    const startX = Math.floor((-panOffset.x - VIEWPORT_BUFFER * CELL_SIZE) / CELL_SIZE);
    const endX = Math.ceil((-panOffset.x + rect.width + VIEWPORT_BUFFER * CELL_SIZE) / CELL_SIZE);
    const startY = Math.floor((-panOffset.y - VIEWPORT_BUFFER * CELL_SIZE) / CELL_SIZE);
    const endY = Math.ceil((-panOffset.y + rect.height + VIEWPORT_BUFFER * CELL_SIZE) / CELL_SIZE);
    
    const cells = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.push({ x, y });
      }
    }
    return cells;
  };

  // Function to get the item for a given grid position using modulo for infinite tiling
  const getItemForPosition = (x, y) => {
    const gridItems = getGridItems();
    if (gridItems.length === 0) return null;
    
    const { width, height } = getGridDimensions();
    
    // Use modulo to find position within the repeating tile pattern
    const tileX = ((x % width) + width) % width;
    const tileY = ((y % height) + height) % height;
    
    // Calculate linear position and cycle through available items
    const linearPosition = tileY * width + tileX;
    const itemIndex = linearPosition % gridItems.length;
    
    return gridItems[itemIndex];
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ backgroundColor: '#FEFCF8' }}>
      
      <div
        ref={containerRef}
        className="h-full w-full relative"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${panOffset.x + parallaxOffset.x}px, ${panOffset.y + parallaxOffset.y}px)`,
            transition: isDragging ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out'
          }}
        >
          {getVisibleCells().map(({ x, y }) => {
            const item = getItemForPosition(x, y);
            const itemKey = `${x}-${y}`;
            const isInitialLoadAnimated = initialLoadItems.has(itemKey);
            
            return (
              <div
                key={itemKey}
                className="absolute"
                style={{
                  left: x * CELL_SIZE + (CELL_SIZE - IMAGE_SIZE) / 2, // Center the image in the cell
                  top: y * CELL_SIZE + (CELL_SIZE - IMAGE_SIZE) / 2,
                  width: IMAGE_SIZE,
                  height: IMAGE_SIZE,
                }}
              >
                {item && (
                  <div
                    className="w-full h-full hover:scale-110 transition-transform duration-300 ease-out cursor-pointer"
                    style={{
                      ...(!isInitialLoadAnimated && !isInitialLoadComplete && {
                        transform: 'scale(0)',
                        opacity: 0
                      }),
                      ...(isInitialLoadAnimated && {
                        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out'
                      })
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemClick(item);
                    }}
                  >
                    <div 
                      className={`w-full h-full rounded-lg ${item.originalData?.image_url ? '' : item.color} flex items-center justify-center overflow-hidden`}
                    >
                      {item.originalData?.image_url ? (
                        <img 
                          src={item.originalData.image_url} 
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to icon if image fails to load
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`${item.originalData?.image_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-4xl text-white/90`}
                      >
                        {item.icon}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {selectedItem && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
            isModalOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          />
          
          {/* Modal Content */}
          <div
            className={`relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all duration-300 ${
              isModalOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
            }`}
          >
            {/* Close Button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="p-6 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedItem.color} text-white font-semibold shadow-lg`}>
                  {selectedItem.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedItem.title}</h2>
                  <p className="text-sm text-gray-500 capitalize">{selectedItem.type}</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 pb-6">
              <div className="mb-6">
                <div 
                  className={`w-full h-48 rounded-lg shadow-sm ${selectedItem.originalData?.image_url ? 'bg-gray-100' : selectedItem.color} flex items-center justify-center overflow-hidden`}
                >
                  {selectedItem.originalData?.image_url ? (
                    <img 
                      src={selectedItem.originalData.image_url} 
                      alt={selectedItem.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to icon if image fails to load
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    className={`${selectedItem.originalData?.image_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-6xl text-white/80`}
                  >
                    {selectedItem.icon}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {selectedItem.originalData?.description || 
                     selectedItem.originalData?.details || 
                     `Learn more about ${selectedItem.title} and explore related topics.`}
                  </p>
                  
                  {selectedItem.originalData && (
                    <div className="mt-4 space-y-2">
                      {selectedItem.originalData.category && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Category: </span>
                          <span className="text-gray-600">{selectedItem.originalData.category}</span>
                        </div>
                      )}
                      {selectedItem.originalData.created_at && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Added: </span>
                          <span className="text-gray-600">
                            {new Date(selectedItem.originalData.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <button className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg transition-colors">
                    View Details
                  </button>
                  <button className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors">
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
