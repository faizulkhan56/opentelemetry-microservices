const express = require('express');
const { createOrder, getOrder } = require('../controllers/orders.controller');

const router = express.Router();

router.post('/', createOrder);
router.get('/:id', getOrder);

module.exports = router;