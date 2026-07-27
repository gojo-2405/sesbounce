FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY .env .env
COPY . .

RUN mkdir -p /app/data
VOLUME ["/app/data"]

RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]
