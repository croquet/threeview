# Croquet 3D Model Viewer (Threeview)

## Introduction

The Croquet Threeview allows a group of users to view a 3D model together. A user can drop a PDF a model file or a directory into the area, and any user can rotate and change the zoom level. Currently FBX, OBJ, and GLB are support.  A directory with a .obj file, .mtl file and a set of texture images can be dropped onto the app and it handles it correctly.

## Code Organization

The Threeview source code is in the src directory.

You need to create a file called `apiKey.js` by copying apyKey.js-example and replace the value with your apiKey obtained from [Croquet Dev Portal](croquet.io/keys):

   ```JavaScript
   const apiKey = "<insert your apiKey from croquet.io/keys>";
   export default apiKey;
   ```

## Running The Threeview Demo

Run `npm install` and then run `npm start` that runs a local webpack server at localhost:9010.

Running `npm run build` creates a directory called `dist` with bundled static files. You can deploy the directory to your server.
