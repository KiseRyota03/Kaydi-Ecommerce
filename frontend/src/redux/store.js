import { combineReducers, configureStore } from "@reduxjs/toolkit";
import userReducer from "./user/userSlice";
import cartReducer from "./cart/cartSlice";
import orderReducer from "./order/orderSlice";
import voucherReducer from "./order/voucherSlice";

import { persistReducer, persistStore } from "redux-persist"; // cau hinh tinh nang luu tru lau dai
import storage from "redux-persist/lib/storage";

const persistConfig = {
  key: "kaydiEcommerce3",
  storage,
};

const rootReducer = combineReducers({
  user: userReducer,
  cart: cartReducer,
  order: orderReducer,
  voucher: voucherReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(store);
