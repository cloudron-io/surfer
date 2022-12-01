FROM cloudron/base:4.0.0@sha256:3324a94a3b1ef045b6d41623d0b1d3b82ca1721e87a2406c1876b47cbd005d8f

RUN mkdir -p /app/code
WORKDIR /app/code

# vue-cli does not support node 18, have to move to vite
ARG NODE_VERSION=16.18.1
RUN mkdir -p /usr/local/node-${NODE_VERSION} && \
    curl -L https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz | tar zxf - --strip-components 1 -C /usr/local/node-${NODE_VERSION}
ENV PATH /usr/local/node-${NODE_VERSION}/bin:$PATH

ADD . /app/code/

RUN npm install
RUN npm run build

CMD [ "/app/code/start.sh" ]
