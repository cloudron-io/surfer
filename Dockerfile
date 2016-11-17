FROM cloudron/base:0.9.0
MAINTAINER Johannes Zellner <johannes@nebulon.de>

ENV PATH /usr/local/node-4.2.6/bin:$PATH

RUN mkdir -p /app/code
WORKDIR /app/code

ADD src /app/code/src
ADD app /app/code/app
ADD cli /app/code/cli

ADD package.json server.js start.sh README.md /app/code/

RUN npm install --production

EXPOSE 3000

CMD [ "/app/code/start.sh" ]
