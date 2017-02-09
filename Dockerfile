FROM cloudron/base:0.10.0
MAINTAINER Johannes Zellner <johannes@nebulon.de>

ENV PATH /usr/local/node-6.9.5/bin:$PATH

RUN mkdir -p /app/code
WORKDIR /app/code

ADD src /app/code/src
ADD frontend /app/code/frontend
ADD package.json server.js start.sh /app/code/

RUN npm install --production

CMD [ "/app/code/start.sh" ]
