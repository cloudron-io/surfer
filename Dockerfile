FROM cloudron/node-base:24-20260920@sha256:d984683ec59bf2379130bf41cf3c2b6bc0453f327297d7183525cb05424e7b34

RUN mkdir -p /app/code
WORKDIR /app/code

RUN apt-get update && \
    apt-get install -y --no-install-recommends shared-mime-info && \
    rm -r /var/cache/apt /var/lib/apt/lists

# SURFER_COMMIT is a reference for renovate when building from master. The pipeline always builds from the branch it is run on
# renovate: datasource=git-refs packageName=https://git.cloudron.io/s42/surfer branch=master
ARG SURFER_COMMIT=d88e35892aba7da88b5d9681af0a5f1bb311794f

COPY . /app/code/

RUN npm install
RUN npm run build
RUN npm cache clean --force

COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
