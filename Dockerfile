FROM cloudron/base:1.0.0@sha256:147a648a068a2e746644746bbfb42eb7a50d682437cead3c67c933c546357617

RUN mkdir -p /app/code
WORKDIR /app/code

ADD src /app/code/src
ADD frontend /app/code/frontend
ADD package.json package-lock.json server.js start.sh /app/code/

RUN npm install --production

CMD [ "/app/code/start.sh" ]
