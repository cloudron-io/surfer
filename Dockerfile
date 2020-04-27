FROM cloudron/base:2.0.0@sha256:f9fea80513aa7c92fe2e7bf3978b54c8ac5222f47a9a32a7f8833edf0eb5a4f4

RUN mkdir -p /app/code
WORKDIR /app/code

ADD src /app/code/src
ADD frontend /app/code/frontend
ADD package.json package-lock.json server.js start.sh /app/code/

RUN npm install --production

CMD [ "/app/code/start.sh" ]
