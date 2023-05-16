import { Configuration, DefinePlugin, ProvidePlugin } from 'webpack';
import { resolve } from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const config: Configuration = {
  entry: {
    index: './src/index.ts',
  },
  experiments: {
    asyncWebAssembly: true,
    layers: true,
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
    alias: {
      'pg-native': false,
      'pg-cloudflare': false,
    },
    fallback: {
      net: resolve(__dirname, 'src/polyfill'),
      path: require.resolve('path-browserify'),
      fs: false,
      stream: false,
      util: false,
      tls: false,
      dns: false,
      crypto: false,
      assert: false,
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'TCP/IP Demo',
    }),
    new DefinePlugin({
      process: {
        env: {},
        nextTick: DefinePlugin.runtimeValue(function () {
          return function (fn: () => void) {
            setTimeout(fn, 0);
          };
        }, []),
      },
    }),
    new ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  output: {
    filename: '[name].bundle.js',
    path: resolve(__dirname, 'dist'),
    clean: true,
  },
};

export default config;
