/**
 * State.js — Local state for Crop & Extract tool
 */
export const toolState = {
    // DOM Elements
    video: null,
    dropZone: null,
    cropOverlay: null,
    cropBox: null,
    playhead: null,
    timelineTrack: null,
    videoContainer: null,
    filmstrip: null,
    trimRange: null,

    // Interaction State
    isDraggingSeeker: false,
    isDraggingHandleIn: false,
    isDraggingHandleOut: false,
    isDraggingBox: false,
    isResizingBox: false,

    lastSeekTime: 0,
    trimIn: 0,   // 0.0 to 1.0
    trimOut: 1.0, // 0.0 to 1.0

    activeHandle: null,
    startX: 0,
    startY: 0,
    initialRect: {},
    selectedRatio: null,

    // Constants
    SNAP_THRESHOLD: 5,
    MIN_SIZE_PCT: 15,
    SEEK_THROTTLE: 48 // ms
};
