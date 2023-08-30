FROM node:20.5.1 as frontend_build

WORKDIR /app

COPY ./frontend/package.json ./
COPY ./frontend/package-lock.json ./

RUN npm install

COPY ./frontend ./

RUN npm run build

FROM tiangolo/uwsgi-nginx-flask:python3.11

ENV STATIC_URL /static
ENV STATIC_PATH /var/www/app/static
ENV STATIC_INDEX 1

COPY ./backend/requirements.txt /var/www/requirements.txt

RUN pip install -r /var/www/requirements.txt

COPY ./backend /app

RUN cd /app/ && ./download_data.sh && ls && ls data

RUN mkdir -p /var/www/app/static
COPY --from=frontend_build /app/build/index.html /var/www/app/static
COPY --from=frontend_build /app/build /var/www/app/static