import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { signOutSuccess } from '../redux/user/userSlice'
import { clearCart } from '../redux/cart/cartSlice'
import { setClearOrder } from '../redux/order/orderSlice'
import { FaBars } from "react-icons/fa";

const Navigation = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);

  const handleSignOut = async (e) => {
    e.preventDefault();
    const res = await fetch(`${import.meta.env.VITE_REACT_APP_BACKEND_BASEURL}/api/auth/signout`, {
      method: "POST",
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data.message);
      return;
    } else {
      dispatch(signOutSuccess());
      dispatch(clearCart());
      dispatch(setClearOrder());
      navigate('/');
    }
  }
  const [openBar, setOpenBar] = useState(false);

  return (
    <div className='container mx-auto overflow-x-clip'>
      <div className='relative w-full flex h-[42px] px-[20px] py-[10px] justify-between'>
        <div className='flex gap-[20px]'>
          <a href="https://blog-app-pd5x.onrender.com" target="_blank" rel="noopener noreferrer">
            <span className='cursor-pointer hover:opacity-70'>Kaydi Blog</span>
          </a>
          <span className='cursor-pointer hover:opacity-70'>Kaydi Tourist</span>
          <span className='cursor-pointer hover:opacity-70'>Kaydi FoodStore</span>
        </div>
        <div className='hidden max-lg:block'>
          <FaBars className='cursor-pointer' onClick={() => setOpenBar(!openBar)} />
        </div>
        {openBar && (
          <div className='absolute top-[36px] right-[20px] flex flex-col border z-10 bg-white'>
            <span className=' cursor-pointer hover:opacity-70 hover:bg-gray-100 border px-[10px] py-[5px]'>Tham gia KaydiClub</span>
            <span className=' cursor-pointer hover:opacity-70 hover:bg-gray-100 border px-[10px] py-[5px]'>Blog</span>
            <span className=' cursor-pointer hover:opacity-70 hover:bg-gray-100 border px-[10px] py-[5px]'>Về Kaydi Ecommerce</span>
            <span className=' cursor-pointer hover:opacity-70 hover:bg-gray-100 border px-[10px] py-[5px]'>Trung tâm CSKH</span>
            {currentUser ? (
              <span onClick={handleSignOut} className=' cursor-pointer hover:opacity-70 hover:bg-gray-100 border px-[10px] py-[5px]'>Đăng xuất</span>
            ) : (
              <span onClick={() => navigate('/signIn')} className=' cursor-pointer hover:opacity-70 hover:bg-gray-100 border px-[10px] py-[5px]'>Đăng nhập</span>
            )}
          </div>
        )}
        <div className='flex gap-[20px] max-lg:hidden'>
          <span className='cursor-pointer hover:opacity-70'>Tham gia KaydiClub</span>
          <span className='cursor-pointer hover:opacity-70'>Blog</span>
          <span className='cursor-pointer hover:opacity-70'>Về Kaydi Ecommerce</span>
          <span className='cursor-pointer hover:opacity-70'>Trung tâm CSKH</span>
          {currentUser ? (
            <span onClick={handleSignOut} className='cursor-pointer hover:opacity-70'>Đăng xuất</span>
          ) : (
            <span onClick={() => navigate('/signIn')} className='cursor-pointer hover:opacity-70'>Đăng nhập</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default Navigation