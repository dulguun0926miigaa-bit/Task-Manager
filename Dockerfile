FROM node:20
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install
COPY . .
WORKDIR /app/server
RUN npm install && npx prisma generate
EXPOSE 5000
CMD ["npm", "start"]
