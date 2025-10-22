FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install 
COPY . .
EXPOSE 5000
RUN yarn build
CMD ["yarn", "be"]