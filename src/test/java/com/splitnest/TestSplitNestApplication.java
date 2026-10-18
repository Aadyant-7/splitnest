package com.splitnest;

import org.springframework.boot.SpringApplication;

public class TestSplitNestApplication {

	public static void main(String[] args) {
		SpringApplication.from(SplitNestApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
