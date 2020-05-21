import { Model, View, App, Session } from "@croquet/croquet";
import { theAssetManager, ImportedObject, ImportedObjectView, THREE } from "@croquet/loaders";

// const THREE = require("three");
// window.THREE = THREE;
require('../thirdparty/three/OrbitControls');

/*
const { GUI } = require('../thirdparty/dat.gui.min');
const extraGuiStyle = document.createElement('style');
extraGuiStyle.innerHTML = `
    .dg.ac {
        -moz-user-select: none;
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
        z-index: 2;
    }
    .dg .croquet-slider-li .property-name {
        width: 25%;
    }
    .dg .croquet-button-li .property-name {
        width: 50%;
    }
    .dg .croquet-button-li .c {
        width: 50%;
    }
    .dg .c {
        width: 75%;
    }
    .dg .slider {
        margin-left: 0;
        width: 70%;
    }
    .dg .has-slider input[type=text] {
        width: 25%;
    }
    .dg .c input[type=checkbox] {
        margin-top: 1px;
        width: 25px;
        height: 25px;
    }
    .dg .c input[type=checkbox]:focus { outline: 0; }
    button.slice-mover {
        position: absolute;
        display: inline-block;
        width: 13%;
        height: 23px;
        top: 2px;
        font: 600 14px sans-serif;
        background: #888;
        color: #fff;
        border-radius: 8px;
    }
    button.slice-mover:focus { outline: 0; }
    button.slice-mover.highlight-ahead { color: #ff0 }
    button.slice-mover.highlight-jump { background: #880 }
    .dg ul.closed button.slice-mover {
        display: none;
    }
`;
document.head.appendChild(extraGuiStyle);
*/

const TPS = "10";             // reflector ticks per sec x local multiplier
const THROTTLE = 1000 / 25;   // UI event throttling
const TOUCH = 'ontouchstart' in document.documentElement;

// app configuration: whether to process user events before they're reflected.
// doing so gives faster feedback for the person driving the events, but means
// that other users' screens will update noticeably later (by the current reflector
// round-trip latency).  for demo purposes, having all update together (i.e., local
// update set to false) is arguably more impressive.
const INSTANT_LOCAL_UPDATE = true;

class ThreeModel extends Model {
    static types() {
        return {
            "THREE.Vector3": THREE.Vector3,
            "THREE.Quaternion": THREE.Quaternion,
        };
    }

    init(options) {
        super.init(options);

        this.subscribe(this.id, "addAsset", this.addAsset);

        this.cameraPos = null;
        this.cameraQuat = null;
        this.cameraZoom = null;
        this.subscribe(this.id, "moveCamera", this.moveCamera);

        this.loadedObject = null;
    }

    addAsset(data) {
        this.loadedObject = ImportedObject.create(data);
        this.publish(this.id, "addObject", this.loadedObject);
    }

    moveCamera(data) {
        if (!this.cameraPos) this.cameraPos = new THREE.Vector3();
        this.cameraPos.set(...data.pos);
        if (!this.cameraQuat) this.cameraQuat = new THREE.Quaternion();
        this.cameraQuat.set(...data.quat);
        this.cameraZoom = data.zoom;
        this.publish(this.id, "cameraMoved", data);
    }
}
ThreeModel.register();

const sceneSpec = { };
window.sceneSpec = sceneSpec; // @@ for debug only
function setUpScene() {
    return new Promise(resolve => {
        // adapted from https://threejs.org/examples/webgl2_materials_texture3d.html
        const scene = sceneSpec.scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffd180);

        // Create renderer
        const container = document.getElementById('container');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2', { antialias: false });
        const renderer = new THREE.WebGLRenderer({ canvas, context });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMapEnabled = true;
        renderer.shadowMapSoft = true;
        renderer.shadowCameraNear = 3;
        renderer.shadowCameraFar = 100;
        renderer.shadowCameraFov = 50;

        container.appendChild(renderer.domElement);

        sceneSpec.render = () => renderer.render(scene, camera);

        // if we want an orthographic camera
        // const h = 10; // frustum height - i.e., the image of an object this tall will take up whole vertical extent of window
        // const camera = sceneSpec.camera = new THREE.OrthographicCamera(-h / 2, h / 2, h / 2, -h / 2, 1, 1000); // left & right will be adjusted to suit window
        // camera.up.set(0, 0, 1); // In our data, z is up

        const cameraFar = 100;
        const cameraNear = 0.01;
        const aspect = window.innerWidth / window.innerHeight;
        const camera = sceneSpec.camera = new THREE.PerspectiveCamera(75, aspect, cameraNear, cameraFar);
        onWindowResize();

        const cameraTarget = [0, 0, -5];

        // create a dummy camera that will be moved by the OrbitControls
        const cameraAvatar = sceneSpec.cameraAvatar = camera.clone();
        cameraAvatar.position.set(0, 4, 2);
        cameraAvatar.lookAt(...cameraTarget);
        cameraAvatar.updateMatrixWorld();

        camera.position.copy(cameraAvatar.position);
        camera.quaternion.copy(cameraAvatar.quaternion);
        camera.updateMatrixWorld();

        sceneSpec.initialCameraPos = new THREE.Vector3().copy(camera.position);
        sceneSpec.initialCameraQuat = new THREE.Quaternion().copy(camera.quaternion);
        sceneSpec.initialCameraZoom = camera.zoom;

        // create controls
        const controls = new THREE.OrbitControls(cameraAvatar, renderer.domElement);
        controls.enablePan = false;
        controls.addEventListener('change', () => sceneSpec.handleControlChange && sceneSpec.handleControlChange());

        // for orthographic
        // controls.minZoom = 0.5;
        // controls.maxZoom = 4;

        // for perspective
        controls.minDistance = 1;
        controls.maxDistance = 40;

        controls.zoomSpeed = TOUCH ? 0.5 : 0.25;

        controls.target.set(...cameraTarget);
        controls.update();

        const light = new THREE.DirectionalLight("#ffffdd");
        light.position.set(4, 7, 4);
        light.castShadow = true;
        // light.shadow.mapSize.width = 1024;  // default
        // light.shadow.mapSize.height = 1024; // default
        // light.shadow.radius = 5;
        // light.shadow.camera.near = 0.5;    // default
        // light.shadow.camera.far = 100; //10;     // default
        scene.add(light);
        const ambientLight = new THREE.HemisphereLight("#ddddff", "#ffdddd");
        scene.add(ambientLight);

        const floor = new THREE.Mesh(
            // width, height, widthSegments, heightSegments
            new THREE.PlaneGeometry(40,40),
            new THREE.MeshStandardMaterial({ color: 0x80ffd1, side: THREE.BackSide })
            );
        floor.position.y = -0.01;
        floor.rotation.x = Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        /*
        document.addEventListener("keydown", evt => {
            if (evt.key === "Escape") overrideDrawingMode(true);
            });
        document.addEventListener("keyup", evt => {
            if (evt.key === "Escape") overrideDrawingMode(false);
            if (evt.key === "Backspace") deleteHighlightedStroke(); // if one is highlighted
            });
        */

        console.log("scene ready");
        resolve();

        window.addEventListener('resize', onWindowResize, false);

        function onWindowResize() {
            renderer.setSize(window.innerWidth, window.innerHeight);

            camera.aspect = window.innerWidth / window.innerHeight;

            // for orthographic camera
            // const newAspect = window.innerWidth / window.innerHeight;
            // const frustumHeight = camera.top - camera.bottom;
            // camera.left = -frustumHeight * newAspect / 2;
            // camera.right = frustumHeight * newAspect / 2;

            camera.updateProjectionMatrix();
        }
    });
}

// a throttle that also ensures that the last value is delivered
function throttle(fn, delay) {
    let lastTime = 0;
    let timeoutForFinal = null;
    const clearFinal = () => {
        if (timeoutForFinal) {
            clearTimeout(timeoutForFinal);
            timeoutForFinal = null;
        }
        };
    const runFn = (...args) => {
        clearFinal(); // shouldn't be one, but...
        lastTime = Date.now();
        fn(...args);
        };
    return (...args) => {
        clearFinal();
        const toWait = delay - (Date.now() - lastTime);
        if (toWait < 0) runFn(...args);
        else timeoutForFinal = setTimeout(() => runFn(...args), toWait);
        };
}

class ThreeView extends View {

    constructor(model) {
        super(model);

        this.model = model;

        this.subscribe(this.model.id, "addObject", this.addObject);
        this.subscribe(this.model.id, { event: "cameraMoved", handling: "oncePerFrameWhileSynced" }, this.cameraMoved);

        window.ondragover = event => event.preventDefault();
        const isFileDrop = evt => {
            const dt = evt.dataTransfer;
            for (let i = 0; i < dt.types.length; i++) {
                if (dt.types[i] === "Files") return true;
            }
            return false;
            };
        window.ondrop = evt => {
            evt.preventDefault();

            if (isFileDrop(evt)) this.handleFileDrop(evt.dataTransfer.items);
            };

        this.lastCameraMove = 0;
        sceneSpec.handleControlChange = () => this.cameraAvatarMoved();

        this.syncCameraWithModel();
        if (model.loadedObject) this.addObject(model.loadedObject);
    }

    handleFileDrop(items) {
        theAssetManager.handleFileDrop(items, this.model, this);
    }

    detach() {
        super.detach();
        this.removeObject();
        delete sceneSpec.handleControlChange;
    }

    removeObject() {
        if (this.loadedView) {
            sceneSpec.scene.remove(this.loadedView.threeObj);
            sceneSpec.render();
            this.loadedView.detach();
            this.loadedView = null;
        }
    }

    addObject(model) {
        this.removeObject(); // if any

        const scene = sceneSpec.scene;
        const newView = this.loadedView = new ImportedObjectView(model);
        const obj = newView.threeObj;
        obj.position.set(0, 1, -5);
        scene.add(obj);
    }

    // handle a change reported by the OrbitControls, which we've given direct control over
    // a dummy camera.  here we read out where that camera has been moved to, optionally
    // move our local camera to that position instantly, and publish a replicated message
    // that other instances (and this instance, in the non-instant case) will use to move
    // their cameras.
    async cameraAvatarMoved() {
        const now = Date.now();
        if (now - this.lastCameraMove < THROTTLE) return;

        this.lastCameraMove = now;

        const { camera, cameraAvatar } = sceneSpec;
        const pos = new THREE.Vector3().copy(cameraAvatar.position);
        if (INSTANT_LOCAL_UPDATE) {
            camera.position.copy(cameraAvatar.position);
            camera.quaternion.copy(cameraAvatar.quaternion);
            camera.zoom = cameraAvatar.zoom;
            camera.updateMatrixWorld();
            camera.updateProjectionMatrix();
        }

        this.publish(this.model.id, "moveCamera", { pos: pos.toArray(), quat: cameraAvatar.quaternion.toArray(), zoom: cameraAvatar.zoom, viewId: this.viewId });
    }

    // someone has published a message that moves the camera.
    // check whether instant update is happening: if so,
    // and this is a message from here, also ignore it.
    cameraMoved(data) {
        if (INSTANT_LOCAL_UPDATE && data.viewId === this.viewId) return;

        this.syncCameraWithModel(data.viewId);
    }

    syncCameraWithModel(sourceViewId) { // sourceId will be unspecified when exiting drawing mode
        const useInitialValues = this.model.cameraPos === null;

        const { camera, cameraAvatar } = sceneSpec;

        camera.position.copy(useInitialValues ? sceneSpec.initialCameraPos : this.model.cameraPos);
        camera.quaternion.copy(useInitialValues ? sceneSpec.initialCameraQuat : this.model.cameraQuat);
        camera.zoom = useInitialValues ? sceneSpec.initialCameraZoom : this.model.cameraZoom;
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();

        // if viewId is supplied, and it's our viewId, this must be an immediate reflection
        // of a message published from here, triggered by movement of the camera avatar.
        // in that case, don't try to force a new position on the avatar.
        if (sourceViewId !== this.viewId) {
            cameraAvatar.position.copy(camera.position);
            cameraAvatar.quaternion.copy(camera.quaternion);
            cameraAvatar.zoom = camera.zoom;
            cameraAvatar.updateMatrixWorld();
        }
    }
}

async function go() {
    // get all the data loaded and prepped before we even attempt to start the session
    await setUpScene();

    App.messages = true;
    App.makeWidgetDock();

    const session = await Session.join(`threeview-${App.autoSession()}`, ThreeModel, ThreeView, { step: "manual", tps: TPS, optionsFromUrl: [] });

    window.requestAnimationFrame(frame);
    function frame(timestamp) {
        window.requestAnimationFrame(frame);

        session.step(timestamp);

        if (session.view) sceneSpec.render();
    }
}

go();
