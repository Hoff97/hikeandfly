docker buildx build --progress=plain -t hoff97/hikeandfly:latest ./
docker run -p 8080:8080 hoff97/hikeandfly:latest


docker buildx build --progress=plain -t hoff97/hikeandfly_slow:latest -f Dockerfile_python_backend ./