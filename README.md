# Croquet 3D Model Viewer (Threeview)

## Introduction

The Croquet Threeview allows a group of users to view a 3D model together. A user can drop a model file into the app, and any user can rotate and change the zoom level. Currently FBX, OBJ, and GLB are support.  A directory with a .obj file, .mtl file and a set of texture images can be dropped onto the app and it handles it correctly.

## Code Organization

The Threeview source code is in the src directory.

You need to edit `index.html` and replace the apiKey with your own obtained from [Croquet Dev Portal](croquet.io/keys), while you can choose your own `appId`:

   ```JavaScript
   window.CROQUET_SESSION = {
      apiKey: "<insert your apiKey from croquet.io/keys>",
      appId: "io.croquet.threeview",
   }
   ```

Declaring the `apiKey` in the HTML makes it easy to change later without having to rebuild the whole app.

## Running The Threeview Demo

Run `npm install` and then run `npm start` that runs a local webpack server at localhost:9010.

Running `npm run build` creates a directory called `dist` with bundled static files. You can deploy the directory to your server.
