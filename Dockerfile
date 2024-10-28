FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4 AS frontend

COPY frontend/ /app/build/frontend/
WORKDIR /app/build/frontend

RUN npm install
RUN npm run build

FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4

COPY --from=frontend /app/build/dist /app/code/dist

COPY src/ /app/code/src/
COPY server.js package.json package-lock.json /app/code/
WORKDIR /app/code

RUN npm install

WORKDIR /app/code

ADD start.sh /app/code/
CMD [ "/app/code/start.sh" ]
