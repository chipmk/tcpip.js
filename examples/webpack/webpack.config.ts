import HtmlWebpackPlugin from 'html-webpack-plugin';
import { resolve } from 'path';
import { Configuration } from 'webpack';

const config: Configuration = {
  entry: {
    index: './src/index.ts',
  },
  optimization: {
    minimize: false,
  },
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.wasm/,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      net: resolve(__dirname, 'src/polyfill'),
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'TCP/IP Demo',
    }),
  ],
  output: {
    filename: '[name].bundle.js',
    path: resolve(__dirname, 'dist'),
    clean: true,
  },
};

export default config;
