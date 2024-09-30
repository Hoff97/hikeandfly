FROM node:20.5.1 AS frontend_build

WORKDIR /app

COPY ./frontend/package.json ./
COPY ./frontend/package-lock.json ./

RUN npm install

COPY ./frontend ./

RUN npm run build

FROM docker.io/rust:1-slim-bookworm AS backend_build

ARG pkg=main

WORKDIR /build

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

## copy the main binary
COPY --from=backend_build /build/main ./

RUN mkdir static
COPY --from=frontend_build /app/build/index.html ./static
COPY --from=frontend_build /app/build ./static

## ensure the container listens globally on port 8080
ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8080
ENV ROCKET_LOG_LEVEL=NORMAL

CMD ./main
