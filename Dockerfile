FROM node:20.5.1 AS frontend_build

WORKDIR /app

RUN apt-get update && apt-get install -y curl build-essential pkg-config libssl-dev
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-pack

COPY ./frontend/package.json ./frontend/
COPY ./frontend/package-lock.json ./frontend/

RUN cd frontend && npm install

COPY ./backend-rust ./backend-rust
COPY ./backend-rust-wasm ./backend-rust-wasm
COPY ./frontend ./frontend

RUN cd frontend && npm run build

FROM docker.io/rust:1-slim-bookworm AS backend_build

ARG pkg=main

WORKDIR /build

RUN apt-get update
RUN apt-get install -y pkg-config libssl-dev

COPY ./backend-rust .

RUN --mount=type=cache,target=/build/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    set -eux; \
    cargo build --release --target-dir /build/target; \
    ls; \
    objcopy --compress-debug-sections target/release/$pkg ./main

FROM docker.io/debian:bookworm-slim

WORKDIR /app

RUN mkdir data
RUN apt-get update
RUN apt-get install -y pkg-config libssl-dev

## copy the main binary
COPY --from=backend_build /build/main ./

RUN mkdir static
COPY --from=frontend_build /app/frontend/dist ./static

## ensure the container listens globally on port 8080
ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8080
ENV ROCKET_LOG_LEVEL=NORMAL

CMD ./main
