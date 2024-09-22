FROM node:20.5.1 AS frontend_build

WORKDIR /app

COPY ./frontend/package.json ./
COPY ./frontend/package-lock.json ./

RUN npm install

COPY ./frontend ./

RUN npm run build

FROM python:3.11

ENV PROD=true

WORKDIR /code

COPY ./backend/download_data.sh /code
RUN ./download_data.sh

COPY ./backend/requirements.txt /code

RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY ./backend /code

RUN mkdir -p /static
COPY --from=frontend_build /app/build/index.html /static
COPY --from=frontend_build /app/build /static

CMD ["fastapi", "run", "src/server.py", "--port", "80"]