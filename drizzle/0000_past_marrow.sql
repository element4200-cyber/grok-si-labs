CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`html` text NOT NULL,
	`category` text NOT NULL,
	`art` text NOT NULL,
	`created` integer NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`opens` integer DEFAULT 0 NOT NULL,
	`mint` text
);
