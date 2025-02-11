/* global AFRAME */

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

/**
 * Lounge collider, to detect collisions in the lounge.
 * Adapted and simplified from
 * https://github.com/supermedium/superframe/blob/master/components/aabb-collider/index.js
 */
AFRAME.registerComponent('lounge-collider', {
  schema: {
    interval: {type: 'number', default: 80},
    objects: {type: 'selectorAll', default: ''}
  },

  init: function () {
    this.boundingBox = new THREE.Box3();
    this.boxCenter = new THREE.Vector3();
    this.objectEls = [];
    this.intersectedEls = [];
    this.previousIntersectedEls = [];
    this.newIntersectedEls = [];
    this.clearedIntersectedEls = [];
    this.prevCheckTime = undefined;
    this.observer = new MutationObserver(this.setDirty);
    this.setDirty = this.setDirty.bind(this);
    this.boxMax = new THREE.Vector3();
    this.boxMin = new THREE.Vector3();
  },

  play: function () {
    this.observer.observe(this.el.sceneEl,
                          {childList: true, attributes: true, subtree: true});
    this.el.sceneEl.addEventListener('object3dset', this.setDirty);
    this.el.sceneEl.addEventListener('object3dremove', this.setDirty);
  },

  remove: function () {
    this.observer.disconnect();
    this.el.sceneEl.removeEventListener('object3dset', this.setDirty);
    this.el.sceneEl.removeEventListener('object3dremove', this.setDirty);
  },

  tick: function (time) {
    const boundingBox = this.boundingBox;
    const el = this.el;
    const objectEls = this.objectEls;
    const intersectedEls = this.intersectedEls;
    const previousIntersectedEls = this.previousIntersectedEls;
    const newIntersectedEls = this.newIntersectedEls;
    const clearedIntersectedEls = this.clearedIntersectedEls;
    const prevCheckTime = this.prevCheckTime;

    // Only check for intersection if interval time has passed.
    if (prevCheckTime && (time - prevCheckTime < this.data.interval)) { return; }
    // Update check time.
    this.prevCheckTime = time;

    if (this.dirty) { this.refreshObjects(); };

    // Update the bounding box to account for rotations and position changes.
    boundingBox.setFromObject(el.object3D);
    this.boxMin.copy(boundingBox.min);
    this.boxMax.copy(boundingBox.max);
    boundingBox.getCenter(this.boxCenter);

    // Copy intersectedEls in previousIntersectedEls
    previousIntersectedEls.length = 0;
    for (let i = 0; i < intersectedEls.length; i++) {
      previousIntersectedEls[i] = intersectedEls[i];
    };

    // Populate intersectedEls array.
    intersectedEls.length = 0;
    for (i = 0; i < objectEls.length; i++) {
      if (objectEls[i] === this.el) { continue; }
      // Check for intersection.
      if (this.isIntersecting(objectEls[i])) { intersectedEls.push(objectEls[i]); }
    };

    // Get newly intersected entities.
    newIntersectedEls.length = 0;
    for (i = 0; i < intersectedEls.length; i++) {
      if (previousIntersectedEls.indexOf(intersectedEls[i]) === -1) {
        newIntersectedEls.push(intersectedEls[i]);
      }
    };

    // Emit cleared events on no longer intersected entities.
    clearedIntersectedEls.length = 0;
    for (i = 0; i < previousIntersectedEls.length; i++) {
      if (intersectedEls.indexOf(previousIntersectedEls[i]) !== -1) { continue; }
      previousIntersectedEls[i].emit('hitend');
      clearedIntersectedEls.push(previousIntersectedEls[i]);
    };

    // Emit events on intersected entities. Do this after the cleared events.
    for (i = 0; i < newIntersectedEls.length; i++) {
      if (newIntersectedEls[i] === this.el) { continue; }
      newIntersectedEls[i].emit('hitstart');
    };
  },

  /**
   * AABB collision detection.
   * 3D version of https://www.youtube.com/watch?v=ghqD3e37R7E
   */
  isIntersecting: (function (el) {
    let box;

    if (!el.object3D) { return false };
    if (!el.object3D.aabbBox) {
      // Box.
      el.object3D.aabbBox = new THREE.Box3().setFromObject(el.object3D);
      // Center.
      el.object3D.boundingBoxCenter = new THREE.Vector3();
      el.object3D.aabbBox.getCenter(el.object3D.boundingBoxCenter);
    };
    box = el.object3D.aabbBox;

    const boxMin = box.min;
    const boxMax = box.max;
    return (this.boxMin.x <= boxMax.x && this.boxMax.x >= boxMin.x) &&
           (this.boxMin.y <= boxMax.y && this.boxMax.y >= boxMin.y) &&
           (this.boxMin.z <= boxMax.z && this.boxMax.z >= boxMin.z);
  }),

  /**
   * Mark the object list as dirty, to be refreshed before next raycast.
   */
  setDirty: function () {
    this.dirty = true;
  },

  /**
   * Update list of objects to test for intersection.
   */
  refreshObjects: function () {
    const data = this.data;
    // If objects not defined, intersect with everything.
    if (data.objects) {
      this.objectEls = this.el.sceneEl.querySelectorAll(data.objects);
    } else {
      this.objectEls = this.el.sceneEl.children;
    }
    this.dirty = false;
  }
});

/**
 * Lounge plinth, to set up stuff in the lounge.
 */
AFRAME.registerComponent('lounge-plinth', {
  schema: {
    width: {type: 'number', default: 1},
    depth: {type: 'number', default: 1},
    height: {type: 'number', default: .5},
    color: {type: 'color', default: '#404040'},
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: false,

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    let el = this.el;
    let data = this.data;

    console.log("lounge-plinth (init)");
    this.el.setAttribute('geometry', {
      'primitive': 'box',
      'width': this.data.width,
      'depth': this.data.depth,
      'height': this.data.height
    });
    this.el.setAttribute('material', {'color': this.data.color});
    this.el.addEventListener("staydown", function (event) {
      // When "staydown" received, set position to to be on floor
      let localPosition = el.object3D.worldToLocal(event.detail.worldPosition);
      el.object3D.position.y = localPosition.y + data.height/2;
    });
  },

  update: function (oldData) {
  },

  remove: function () { }
});

/**
 * Lounge staydown component, making the entity, if in a lounge,
   to "fall down" to the floor.
 */
AFRAME.registerComponent('lounge-staydown', {
  schema: {
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: false,

  /**
   * Emit an event with floor position
   */
  floor_level: function(position) {
    localPosition = new THREE.Vector3(position.x,
                                      position.y,
                                      position.z);
    this.el.object3D.updateMatrixWorld();
    this.el.emit('staydown',
                 {worldPosition: this.el.object3D.localToWorld(localPosition)},
                 false);
  },

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    console.log("lounge-staydown component (init)");
    let floor_level = this.floor_level.bind(this);
    let el = this.el;

    // Find entity with lounge component
    let ancestor = el;
    while ((ancestor = ancestor.parentNode) && !("lounge" in ancestor.attributes));
    let loungeEntity = ancestor;
    loungeEntity.addEventListener("loaded", function () {
      // When the entity with lounge is loaded, find floor level
      let floorEntity = loungeEntity.querySelector("a-entity[lounge-floor]")
      let floorComponent = floorEntity.components["lounge-floor"];
      if ('data' in floorComponent) {
        // floorComponent already initialized
        floor_level(floorComponent.data.position);
      } else {
        // floorComponent not initialized yet, set a listener
        floorEntity.addEventListener("componentinitialized", function(event) {
          if (event.detail.name == "lounge-floor") {
            floor_level(floorComponent.data.position);
          };
        });
      };
    });
  },

  update: function (oldData) {
  },

  remove: function () { }
});


/**
 * Lounge entry point component, usually for the camera rig
 * Sets position of entity to that of the entry point in a lounge,
 * usually on the floor.
 * If loungeId is not found, find the first lounge in the scene.
 */
AFRAME.registerComponent('lounge-entry-point', {
  schema: {
    loungeId: {type: 'string', default: 'lounge'},
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: false,

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    let el = this.el;
    console.log("lounge-entry-point component (init)");
    let lounge = document.getElementById(this.data.loungeId);
    if (lounge == null) {
      lounge = document.querySelector("a-entity[lounge]");
    };
    lounge.addEventListener("componentinitialized", function(event) {
      if (event.detail.name == "lounge") {
        let point = lounge.components.lounge.entry_point();
        let pointLocal = el.object3D.worldToLocal(point);
        el.object3D.position.copy(pointLocal);
      };
    });
  },

  update: function (oldData) {
  },

  remove: function () { }
});

/**
 * Floor component for the Lounge
 */
AFRAME.registerComponent('lounge-floor', {
  schema: {
    width: {type: 'number', default: 10},
    depth: {type: 'number', default: 7},
    color: {type: 'color', default: ''},
    texture: {type: 'asset', default: ''},
    position: {type: 'vec3', default: {x: 0, y: 0, z: 0}}
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: false,

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    console.log("lounge-floor component (init)");
    this.floor = document.createElement('a-plane');
    this.floor.setAttribute('class', 'lounge-floor');
    if (this.data.color == '' && this.data.texture == '') {
      this.data.color = '#808080';
    };
    this.floor.setAttribute('color', this.data.color);
    this.floor.setAttribute('src', this.data.texture);
    this.floor.setAttribute('width', this.data.width);
    this.floor.setAttribute('height', this.data.depth);
    this.floor.setAttribute('position', this.data.position);
    this.floor.setAttribute('rotation', '270 0 0');
    this.floor.setAttribute('side', 'double');
//    this.floor.setAttribute('static-body', '');
    this.el.appendChild(this.floor);
  },
  update: function (oldData) {
  },

  remove: function () { }
});

/**
 * Ceiling component for the Lounge
 */
AFRAME.registerComponent('lounge-ceiling', {
  schema: {
    width: {type: 'number', default: 10},
    depth: {type: 'number', default: 7},
    color: {type: 'color', default: '#808080'},
    position: {type: 'vec3', default: {x: 0, y: 0, z: 0}}
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: false,

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    console.log("lounge-ceiling component (init)");
    this.floor = document.createElement('a-plane');
    this.floor.setAttribute('class', 'lounge-ceiling');
    this.floor.setAttribute('color', this.data.color);
    this.floor.setAttribute('width', this.data.width);
    this.floor.setAttribute('height', this.data.depth);
    this.floor.setAttribute('position', this.data.position);
    this.floor.setAttribute('rotation', '90 0 0');
    this.floor.setAttribute('side', 'double');
//    this.floor.setAttribute('static-body', '');
    this.el.appendChild(this.floor);
  },
  update: function (oldData) {
  },

  remove: function () { }
});

/**
 * Wall component for the Lounge
 */
AFRAME.registerComponent('lounge-wall', {
  schema: {
    width: {type: 'number', default: 10},
    height: {type: 'number', default: 4},
    depth: {type: 'number', default: .3},
    color: {type: 'color', default: ''},
    position: {type: 'vec3', default: {x: 0, y: 0, z: 0}},
    opacity: {type: 'number', default: 1},
    texture: {type: 'asset', default: ''},
    wireframe: {type: 'boolean', default: false}
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: true,

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    data = this.data;
    console.log("lounge-wall component (init)");
    this.wall = document.createElement('a-box');
    this.wall.setAttribute('class', 'lounge-wall');
    if (this.id == 'north') {
      this.wall.setAttribute('rotation', '0 0 0');
    } else if (this.id == 'east') {
      this.wall.setAttribute('rotation', '0 90 0');
    } else if (this.id == 'south') {
      this.wall.setAttribute('rotation', '0 180 0');
    } else if (this.id == 'west') {
      this.wall.setAttribute('rotation', '0 270 0');
    }
    this.el.appendChild(this.wall);
  },

  update: function (oldData) {
    data = this.data;
    console.log("lounge-wall component (update)");
    this.wall.setAttribute('color', data.color);
    this.wall.setAttribute('width', data.width);
    this.wall.setAttribute('depth', data.depth);
    this.wall.setAttribute('height', data.height);
    this.wall.setAttribute('position', data.position);
    this.wall.setAttribute('texture', data.texture);
    if (data.opacity < 1) {
      this.wall.setAttribute('material', {transparent: true, opacity: data.opacity});
    };
    //verifica sise proporciono textura
    if(data.texture){
      this.wall.setAttribute('material', 'src', data.texture);
    }
    this.wall.setAttribute('wireframe', data.wireframe);
  },

  remove: function () { }
});

/**
 * Lounge component for A-Frame.
 */
 AFRAME.registerComponent('lounge', {
  schema: {
    width: {type: 'number', default: 10},
    height: {type: 'number', default: 4},
    depth: {type: 'number', default: 7},
    floorColor: {type: 'color', default: ''},
    floorTexture: {type: 'asset', default: ''},
    // Walls values: 'wall', 'open', 'barrier', 'glass'
    north: {type: 'string', default: 'wall'},
    east: {type: 'string', default: 'wall'},
    south: {type: 'string', default: 'wall'},
    west: {type: 'string', default: 'wall'},
    wallColor: {type: 'color', default: ''},
    wallTexture:{type: 'asset', default: ''},
    // Affects 'barrier' and 'glass'
    glassOpacity: {type: 'number', default: 0.4},
    // Affects 'barrier'
    barrierHeight: {type: 'number', default: 1.4},
    ceiling: {type: 'boolean', default: true},
    entryPoint: {type: 'vec3', default: {}},
  },

  /**
   * Set if component needs multiple instancing.
   */
  multiple: false,

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    let data = this.data;
    console.log("lounge component (init)");
    this.lounge = document.createElement('a-entity');
    this.lounge.setAttribute('lounge-floor', {
      'color': data.floorColor,
      'texture': data.floorTexture,
      'width': data.width,
      'depth': data.depth,
      'position': {x: 0, y: -data.height/2, z: 0}
    });
    let walls = {};
    const directions = {
      'north': {x: 0, z: -data.depth/2, width: data.width},
      'east': {x: data.width/2, z: 0, width: data.depth},
      'south': {x: 0, z: data.depth/2, width: data.width},
      'west': {x: -data.width/2, z: 0, width: data.depth}
    };
    for (direction in directions) {
      wall = {}
      if (['wall', 'barrier', 'glass'].includes(data[direction])) {
        wall.x = directions[direction].x;
        wall.z = directions[direction].z;
        wall.width = directions[direction].width;
        if (['wall', 'glass'].includes(data[direction])) {
          // Full walls
          wall.height = data.height;
          wall.y = 0;
        } else if (data[direction] == 'barrier') {
          // Partial wall
          wall.height = data.barrierHeight;
          wall.y = (wall.height - data.height) / 2;
        };
        if (['glass', 'barrier'].includes(data[direction])) {
          wall.opacity = data.glassOpacity;
        } else {
          wall.opacity = 1;
        };
        walls[direction] = wall;
      };
    };
    for (const facing in walls) {
      const wall = walls[facing];
      this.lounge.setAttribute('lounge-wall__' + facing, {
        'color': this.data.wallColor,
        'width': wall.width,
        'height': wall.height,
        'position': {x: wall.x, y: wall.y, z: wall.z},
        'opacity': wall.opacity,
        'texture': data.wallTexture
      });
    };
    if (this.data.ceiling) {
      this.lounge.setAttribute('lounge-ceiling', {
        'color': this.data.ceilingColor,
        'width': this.data.width,
        'depth': this.data.depth,
        'position': {x: 0, y: this.data.height/2, z: 0}
      });
    };
    this.el.appendChild(this.lounge);
    console.log(this.lounge);
  },

  /**
   * Called when component is attached and when component data changes.
   * Generally modifies the entity based on the data.
   */
  update: function (oldData) {
  },

  /**
   * Called when a component is removed (e.g., via removeAttribute).
   * Generally undoes all modifications to the entity.
   */
  remove: function () { },

  /**
   * Called on each scene tick.
   */
  // tick: function (t) { },

  /**
   * Called when entity pauses.
   * Use to stop or remove any dynamic or background behavior such as events.
   */
  pause: function () { },

  /**
   * Called when entity resumes.
   * Use to continue or add any dynamic or background behavior such as events.
   */
  play: function () { },

  /**
   * Event handlers that automatically get attached or detached based on scene state.
   */
  events: {
    // click: function (evt) { }
  },

  /**
   * Give a position located in the floor (in world coordinates)
   * that can act as an entry point for the room.
   */
  entry_point() {
    var point;
    if (Object.keys(this.data.entryPoint).length == 0) {
      point = new THREE.Vector3(0, -this.data.height/2, this.data.depth/4);
    } else {
      point = new THREE.Vector3(this.data.entryPoint.x,
                                this.data.entryPoint.y,
                                this.data.entryPoint.z);
    };
    this.el.object3D.updateMatrixWorld()
    return this.el.object3D.localToWorld(point);
  },
});