-- phpMyAdmin SQL Dump
-- version 5.0.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 23, 2020 at 11:07 AM
-- Server version: 10.4.13-MariaDB
-- PHP Version: 7.4.8

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `bellr`
--
CREATE DATABASE IF NOT EXISTS `bellr` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `bellr`;
-- --------------------------------------------------------

--
-- Table structure for table `shops`
--

CREATE TABLE `shops` (
  `id` int(11) NOT NULL,
  `shop_origin` varchar(255) COLLATE utf8_unicode_ci NOT NULL,
  `access_token` varchar(255) COLLATE utf8_unicode_ci NOT NULL,
  `notifications` text COLLATE utf8_unicode_ci NOT NULL,
  `slack_access` text COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `slack_webhook_url` varchar(255) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `subscription_id` bigint(20) NOT NULL DEFAULT 0,
  `subscription_plan` tinyint(10) NOT NULL DEFAULT 0,
  `subscription_status` tinyint(4) NOT NULL DEFAULT 0,
  `slack_connected` tinyint(4) NOT NULL DEFAULT 0,
  `first_installed_time` datetime NOT NULL DEFAULT current_timestamp(),
  `trial_expiration_time` varchar(50) COLLATE utf8_unicode_ci NOT NULL,
  `subscription_activated_time` datetime DEFAULT NULL,
  `timezone` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '+00',
  `money_format` varchar(50) COLLATE utf8_unicode_ci NOT NULL DEFAULT '${{amount}}'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `shops`
--
ALTER TABLE `shops`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `shop_origin` (`shop_origin`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `shops`
--
ALTER TABLE `shops`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
