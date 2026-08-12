FROM cloudron/base:5.1.0@sha256:1c0666c9abe9e2090d33686826d4e97769b799124573118d41e0d7485135748e
ENV PATH=/usr/local/node-24.19.0/bin:$PATH

RUN mkdir -p /app/code
WORKDIR /app/code

# SURFER_COMMIT is a reference for renovate when building from master. The pipeline always builds from the branch it is run on
# renovate: datasource=git-refs packageName=https://git.cloudron.io/apps/surfer branch=master
ARG SURFER_COMMIT=df07eb80c4c13b7e1e25361cf2c1a009ff6fbee0

COPY . /app/code/

RUN npm install
RUN npm run build
RUN npm cache clean --force

COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
