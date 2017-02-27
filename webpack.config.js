var path = require('path');

module.exports = {
  entry: {
    app: [path.resolve('./app/js/main.js')]
  },
  output: {
    path: path.resolve('./'),
    filename: "./bundle.js"
  },
  module: {
    loaders: [
      {
				test: /\.css$/,
				loader: "style-loader!css-loader"
			},
      {
          test: /\.png$/,
          loader: "url-loader",
          query: { mimetype: "image/png" }
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        include: [
          path.resolve(__dirname, "app/js")
        ],
        query: {
          presets: 'es2015'
        }
      }
    ]
  },
  devServer: {
    contentBase: "./app"
  },
  devtool: 'source-map'
};
