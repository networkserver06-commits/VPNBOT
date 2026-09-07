CREATE TABLE `shared_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('file','config') NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text,
	`fileName` varchar(255),
	`mimeType` varchar(120),
	`storageKey` varchar(500),
	`contentText` text,
	`sizeBytes` int,
	`published` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shared_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tech_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`category` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`url` varchar(500),
	`published` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tech_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramUserId` varchar(32) NOT NULL,
	`username` varchar(120),
	`firstName` varchar(120),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_subscribers_telegramUserId_unique` UNIQUE(`telegramUserId`)
);
