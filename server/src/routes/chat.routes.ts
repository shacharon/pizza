import { Router } from 'express';
import { postChat } from '../controllers/chat.controller.js';
import { restaurantsStubHandler, restaurantsSearchHandler } from '../controllers/restaurants.controller.js';

export const chatRouter = Router();

chatRouter.post('/chat', postChat);
chatRouter.post('/restaurants/stub', restaurantsStubHandler);
chatRouter.post('/restaurants/search', restaurantsSearchHandler);


