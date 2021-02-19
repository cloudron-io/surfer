FROM cloudron/base:3.0.0@sha256:455c70428723e3a823198c57472785437eb6eab082e79b3ff04ea584faf46e92

RUN mkdir -p /app/code
WORKDIR /app/code

ADD . /app/code/

RUN npm install
RUN npm run build

CMD [ "/app/code/start.sh" ]
