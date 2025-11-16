FROM node:18-slim
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y fonts-noto-cjk && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD [ "node", "index.js" ]
