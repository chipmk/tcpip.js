FROM debian:bookworm

ARG WABT_VERSION=1.0.36

RUN apt-get update && apt-get install -y \
  git \
  g++ \
  cmake \
  python3 \
  ninja-build

RUN git clone --branch ${WABT_VERSION} --depth 1 https://github.com/WebAssembly/wabt /wabt && \
  cd /wabt && \
  git submodule update --init && \
  mkdir build

WORKDIR /wabt/build

RUN cmake .. && \
  cmake --build .

ENV PATH="/wabt/build:${PATH}"
