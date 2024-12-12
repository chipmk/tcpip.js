FROM debian:buster

ARG BINARYEN_VERSION=114

RUN apt-get update && apt-get install -y \
  git \
  g++ \
  cmake

RUN git clone --branch version_${BINARYEN_VERSION} --depth 1 https://github.com/WebAssembly/binaryen /binaryen

WORKDIR /binaryen

RUN cmake -DBUILD_TESTS=OFF . && make -j$(nproc) && make install