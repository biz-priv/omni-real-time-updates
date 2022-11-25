FROM --platform=linux/amd64 node:14.17.3-alpine
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY . .
RUN npm install
CMD [ "node", "server.js"]