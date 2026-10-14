CREATE TABLE `launches` (
	`mint` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`uri` text NOT NULL,
	`image_uri` text DEFAULT '' NOT NULL,
	`signature` text,
	`project_id` text,
	`receipt_hash` text NOT NULL,
	`prepared_at` integer NOT NULL,
	`min_slot` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`source` text DEFAULT 'site' NOT NULL
);
