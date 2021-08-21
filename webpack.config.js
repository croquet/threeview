const HtmlWebPackPlugin = require('html-webpack-plugin');
const fetch = require('node-fetch');
const path = require('path');

module.exports = {
    entry : './src/threeview.js',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: '[name]-[contenthash:8].js',
        chunkFilename: 'chunk-[name]-[contenthash:8].js',
    },
    devServer: {
        disableHostCheck: true,
        contentBase: path.join(__dirname, 'dist'),
        publicPath: '/',
        port: 9009
    },
    // use Croquet loaded via <script>
    externals: {
        "@croquet/croquet": "Croquet",
    },
    plugins: [
        new HtmlWebPackPlugin({
            template: 'src/index.html',   // input
            filename: 'index.html',   // output filename in dist/
            templateParameters: async () => {
                const response = await fetch('https://croquet.io/lib/croquet-latest-pre.txt');
                if (!response.ok) throw Error(`${response.status} ${response.statusText} ${response.url}`);
                const body = await response.text();
                return { 'latest_pre': body.trim() };
            },
        }),
    ],
};
