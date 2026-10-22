FROM cloudron/node-base:24-20261021@sha256:7435d8aca138ce01cfca4cd7ec05683223b8f5d7198c9abdaaefa1b6ba14b4c6

RUN mkdir -p /app/code
WORKDIR /app/code

RUN apt-get update && \
    apt-get install -y --no-install-recommends shared-mime-info && \
    rm -r /var/cache/apt /var/lib/apt/lists

# SURFER_COMMIT is a reference for renovate when building from master. The pipeline always builds from the branch it is run on
# renovate: datasource=git-refs packageName=https://git.cloudron.io/apps/surfer branch=master
ARG SURFER_COMMIT=854d3b89dfe929e53c6ff69e13614f529fd85b87

COPY . /app/code/

RUN npm install
RUN npm run build
RUN npm cache clean --force

COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
