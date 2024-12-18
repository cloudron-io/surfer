FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4

RUN mkdir -p /app/code
WORKDIR /app/code

ARG NODE_VERSION=22.11.0
RUN mkdir -p /usr/local/node-${NODE_VERSION} && curl -L https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz | tar zxf - --strip-components 1 -C /usr/local/node-${NODE_VERSION}
ENV PATH /usr/local/node-${NODE_VERSION}/bin:$PATH

# renovate: datasource=gitlab-tags depName=apps/surfer versioning=semver extractVersion=^v(?<version>.+)$ registryUrl=https://git.cloudron.io
ARG SURFER_VERSION=6.2.3

# for release
RUN curl -L https://git.cloudron.io/apps/surfer/-/archive/v${SURFER_VERSION}/surfer-v${SURFER_VERSION}.tar.gz | tar -xz --strip-components 1 -f - -C . && \
    npm install && \
    npm run build && \
    npm cache clean --force

COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
