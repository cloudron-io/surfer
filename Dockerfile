FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4 AS base

ARG NODE_VERSION=22.11.0
RUN mkdir -p /usr/local/node-${NODE_VERSION} && curl -L https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz | tar zxf - --strip-components 1 -C /usr/local/node-${NODE_VERSION}
ENV PATH /usr/local/node-${NODE_VERSION}/bin:$PATH

FROM base AS frontend

COPY frontend/ /app/build/frontend/
WORKDIR /app/build/frontend

RUN npm install
RUN npm run build

FROM base

COPY --from=frontend /app/build/dist /app/code/dist

COPY src/ /app/code/src/
COPY server.js package.json package-lock.json /app/code/
WORKDIR /app/code

RUN npm install

WORKDIR /app/code

ADD start.sh /app/code/
CMD [ "/app/code/start.sh" ]
