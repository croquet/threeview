import * as THREE from "three";
import * as fflate from 'fflate';
import JSZip from 'jszip';
import {loadThreeJSLib} from "./ThreeJSLibLoader";
import {AssetManager} from "./assetManager";

// used by AssetManager
window.THREE = THREE;
window.JSZip = JSZip;
window.fflate = fflate;

const THROTTLE = 1000 / 25;   // UI event throttling
const TOUCH = 'ontouchstart' in document.documentElement;

// app configuration: whether to process user events before they're reflected.
// doing so gives faster feedback for the person driving the events, but means
// that other users' screens will update noticeably later (by the current reflector
// round-trip latency).  for demo purposes, having all update together (i.e., local
// update set to false) is arguably more impressive.
const URL_PARAMS = new URLSearchParams(window.location.search);
const INSTANT_LOCAL_UPDATE = !URL_PARAMS.has("demo");

class ThreeModel extends Croquet.Model {
    static types() {
        return {
            "THREE.Vector3": THREE.Vector3,
            "THREE.Quaternion": THREE.Quaternion,
        };
    }

    init(options) {
        super.init(options);

        this.loadedObject = null;
        this.cameraPos = null;
        this.cameraQuat = null;
        this.cameraZoom = null;

        this.subscribe(this.id, "addAsset", this.addAsset);
        this.subscribe(this.id, "moveCamera", this.moveCamera);
    }

    addAsset(data) {
        if (this.loadedObject) {
            if (data.dataId === this.loadedObject.dataId &&
                data.loadType === this.loadedObject.loadType) {
                // to guard the case when a preloaded content is added from code.
                return;
            }
        }

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
ThreeModel.register("ThreeModel");

export class ImportedObject extends Croquet.Model {
    init(options) {
        super.init(options);
        this.dataId = options.dataId;
        this.loadType = options.loadType;
        this.creationTime = this.now();
    }
}
ImportedObject.register("ImportedObject");

const sceneSpec = { };
window.sceneSpec = sceneSpec; // @@ for debug only
const cameraTarget = [0, 0, 0];
async function setUpScene() {
    const libs = [
        "loaders/OBJLoader.js",
        "loaders/MTLLoader.js",
        "loaders/GLTFLoader.js",
        "loaders/FBXLoader.js",
        "loaders/DRACOLoader.js",
        "controls/OrbitControls.js",
    ];
    await Promise.all(libs.map(lib => loadThreeJSLib(lib, THREE)));
    return new Promise(resolve => {
            // adapted from https://threejs.org/examples/webgl2_materials_texture3d.html
            const scene = sceneSpec.scene = new THREE.Scene();
            scene.background = new THREE.Color(0xdddddd); // yellow 0xffd180

        // Create renderer
        const container = document.getElementById('container');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl', { antialias: true });
        const renderer = new THREE.WebGLRenderer({ canvas, context });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        // renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

        // create a dummy camera that will be moved by the OrbitControls
        const cameraAvatar = sceneSpec.cameraAvatar = camera.clone();
        cameraAvatar.position.set(0, 4, 7);
        cameraAvatar.lookAt(...cameraTarget);
        cameraAvatar.updateMatrixWorld();

        camera.position.copy(cameraAvatar.position);
        camera.quaternion.copy(cameraAvatar.quaternion);
        camera.updateMatrixWorld();

        sceneSpec.initialCameraPos = new THREE.Vector3().copy(camera.position);
        sceneSpec.initialCameraQuat = new THREE.Quaternion().copy(camera.quaternion);
        sceneSpec.initialCameraZoom = camera.zoom;

        // create controls
        const controls = new window.THREE.OrbitControls(cameraAvatar, renderer.domElement);
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

        const light = new THREE.DirectionalLight("#ddddcc");
        light.position.set(3, 5, 5);
        light.castShadow = true;
        const shadowHalf = 3;
        light.shadow.camera.left = -shadowHalf;
        light.shadow.camera.right = shadowHalf;
        light.shadow.camera.top = shadowHalf * 3 / 2;
        light.shadow.camera.bottom = -shadowHalf / 2;
        light.shadow.mapSize.width = 4096; // as high as we dare, to avoid banding on objects
        light.shadow.mapSize.height = 4096;
        light.shadow.radius = 8; // higher is smoother, but fine shadows get fuzzy
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 20;
        scene.add(light);
        const ambientLight = new THREE.HemisphereLight("#ddddff", "#ffdddd");
        scene.add(ambientLight);

        // const cameraHelper = new THREE.CameraHelper(light.shadow.camera);
        // scene.add(cameraHelper);

        const floor = new THREE.Mesh(
            // width, height, widthSegments, heightSegments
            new THREE.PlaneGeometry(40,40),
            new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.BackSide, roughness: 1 })
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

class ThreeView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;
        window.assetManager = this.assetManager = new AssetManager();

        this.assetManager.setupHandlersOn(window, (buffer, fileName, type) => {
            return Croquet.Data.store(this.sessionId, buffer, true).then(handle => {
                const dataId = Croquet.Data.toId(handle);
                this.publish(this.model.id, "addAsset", {dataId, fileName, loadType: type});
            });
        });

        this.subscribe(this.model.id, "addObject", this.addObject);
        this.subscribe(this.model.id, { event: "cameraMoved", handling: "oncePerFrameWhileSynced" }, this.cameraMoved);

        if (window.parent !== window) {
            const { Messenger } = Croquet;
            // assume that we're embedded in Greenlight
            Messenger.startPublishingPointerMove();

            Messenger.setReceiver(this);
            Messenger.send("appReady");
            Messenger.on("appInfoRequest", () => {
                Messenger.send("appInfo", { appName: "threeview", label: "3D model", iconName: "3d.svgIcon", urlTemplate: "../threeview/?q=${q}" });
                });

            Messenger.on("userCursor", data => window.document.body.style.setProperty("cursor", data));
            Messenger.send("userCursorRequest");
        }

        this.lastCameraMove = 0;
        sceneSpec.handleControlChange = () => this.cameraAvatarMoved();

        this.syncCameraWithModel();

        if (model.loadedObject) {
            this.addObject(model.loadedObject);
        } else if (URL_PARAMS.get("default")) {
            // The dataId is taken from a Chrome dev console stpped at addAsset.
            // You could imagine to have binary data in code, store it on server
            // and then fetch it down to all clients but it is simply much easier
            // if it requests a file that is already uploaded.
            this.publish(this.model.id, "addAsset", {
                dataId: "3JVTNIubvlqeaQsXeMxCxjYespSkU4mGEYuCNPgDj0xUIj4-OjlwZWUsIyYvOWQ_OWQpOCU7Py8-ZCMlZT9lMB8-PRoFMAw_BRl7ASMtBxAjf3lzMgwODXJ6eGUjJWQpOCU7Py8-ZD4iOC8vPCMvPWU8AyMfCC0lAH05ciUwORMeEg99EhoOIg8Gcy4dPiEnHyEiPXJ-GzMFDhwpZS4rPitlAh0rEiwzcjATEH4OMz5yGx59fDh-PRA_MB0TGiIrJxgNJDwZcg4sIid4Dw",
                fileName: "/LittlestTokyo.glb",
                loadType: "glb"
            });
        }
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

    addObject(loadedObject) {
        this.removeObject(); // if any
        const newView = this.loadedView = new ImportedObjectView(loadedObject);

        const scene = sceneSpec.scene;
        const obj = newView.threeObj;
        obj.position.set(cameraTarget[0], 1, cameraTarget[2]);
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

export class ImportedObjectView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;

        this.threeObj = new THREE.Group();
        // add a placeholder
        this.placeHolder = new THREE.Mesh(
            new THREE.SphereBufferGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1 })
        );
        this.threeObj.add(this.placeHolder);

        if (this.model.dataId && this.model.loadType) {
            this.loadAsset(this.model.dataId, this.model.loadType);
        }
    }

    detach() {
        super.detach();
        this.animationSpec = null;
    }

    runAnimation() {
        const spec = this.animationSpec;
        if (!spec) return;

        const { mixer, startTime, lastTime } = spec;
        const now = this.now();
        const newTime = (now - startTime) / 1000, delta = newTime - lastTime;
        mixer.update(delta);
        spec.lastTime = newTime;

        this.future(1000 / 20).runAnimation();
    }

    objectReady(obj) {
        this.threeObj.remove(this.placeHolder);
        const bbox = (new THREE.Box3()).setFromObject(obj);
        const rawHeight = bbox.max.y - bbox.min.y;
        const scale = 2 / rawHeight;
        obj.position.addVectors(bbox.min, bbox.max);
        obj.position.multiplyScalar(-0.5);
        obj.traverse(o => o.castShadow = o.receiveShadow = true);
        this.threeObj.add(obj);
        this.threeObj.scale.set(scale, scale, scale);
        // this.publish(this.id, ViewEvents.changedDimensions, {});
        if (obj._croquetAnimation) {
            const spec = obj._croquetAnimation;
            spec.startTime = this.model.creationTime;
            this.animationSpec = spec;
            this.future(500).runAnimation();
        }

        // if (statusDisplay && statusDisplay.hideToast) setTimeout(() => statusDisplay.hideToast(), 1000); // have it hang around even if load was instantaneous
    }

    loadAsset(dataId, loadType) {
        const handle = Croquet.Data.fromId(dataId);
        return Croquet.Data.fetch(this.sessionId, handle).then(buffer => {
            window.assetManager.load(buffer, loadType, THREE).then(obj => {
                this.objectReady(obj);
            });
        });
    }
}

async function go() {
    // get all the data loaded and prepped before we even attempt to start the session
    await setUpScene();

    Croquet.App.messages = true;
    Croquet.App.makeWidgetDock();

    if (URL_PARAMS.has("apiKey")) {
        // allow the apiKey to be passed in as a query parameter
        window.CROQUET_SESSION.apiKey = URL_PARAMS.get("apiKey");
    }

    try {
        const session = await Croquet.Session.join({
            ...window.CROQUET_SESSION, // apiKey and appId from index.html
            model: ThreeModel,
            view: ThreeView,
            tps: 10,
            eventRateLimit: 60,
            step: "manual",
        });

        window.requestAnimationFrame(frame);
        function frame(timestamp) {
            window.requestAnimationFrame(frame);

            session.step(timestamp);

            if (session.view) sceneSpec.render();
        }
    } catch (err) {
        if (err.message.includes("API key")) {
            console.warn("API key required.  Please provide a valid API key in index.html");
        } else throw err;
    }
}

go();
