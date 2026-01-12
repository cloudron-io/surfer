FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

RUN mkdir -p /app/code
WORKDIR /app/code

# renovate: datasource=gitlab-tags depName=apps/surfer versioning=semver extractVersion=^v(?<version>.+)$ registryUrl=https://git.cloudron.io
ARG SURFER_VERSION=6.4.0

# for release
RUN curl -L https://git.cloudron.io/apps/surfer/-/archive/v${SURFER_VERSION}/surfer-v${SURFER_VERSION}.tar.gz | tar -xz --strip-components 1 -f - -C . && \
    npm install && \
    npm run build && \
    npm cache clean --force

COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
