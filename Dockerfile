FROM cloudron/base:0.8.0
MAINTAINER Johannes Zellner <johannes@nebulon.de>

ENV DEBIAN_FRONTEND noninteractive

ENV PATH /usr/local/node-0.12.7/bin:$PATH

RUN mkdir -p /app/code
WORKDIR /app/code

ADD package.json /app/code/package.json
ADD src /app/code/src
ADD app.js /app/code/app.js
ADD app /app/code/app
ADD start.sh /app/code/start.sh
RUN npm install --production

EXPOSE 3000

CMD [ "/app/code/start.sh" ]
