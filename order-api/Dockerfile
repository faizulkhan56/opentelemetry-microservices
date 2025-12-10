FROM node:20

WORKDIR /app
COPY package.json .
RUN npm install
COPY src ./src
RUN mkdir -p logs && apt-get update && apt-get install -y curl

CMD ["node", "src/index.js"]