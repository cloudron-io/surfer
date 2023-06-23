FROM cloudron/base:4.0.0@sha256:3324a94a3b1ef045b6d41623d0b1d3b82ca1721e87a2406c1876b47cbd005d8f

RUN mkdir -p /app/code
WORKDIR /app/code

ADD . /app/code/

RUN npm install
RUN npm run build

CMD [ "/app/code/start.sh" ]
