import HtmlWebpackPlugin from 'html-webpack-plugin';
import { resolve } from 'path';
import { Configuration } from 'webpack';
import 'webpack-dev-server';

const config: Configuration = {
  mode: 'development',
  entry: {
    index: './src/index.ts',
  },
  devtool: 'inline-source-map',
  devServer: {
    static: './dist',
  },
  optimization: {
    minimize: false,
  },
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
      net: require.resolve('@tcpip/polyfill/net'),
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
