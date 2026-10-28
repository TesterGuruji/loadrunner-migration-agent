/*
 * DemoShop_Checkout - vuser_init
 * Sample VuGen Web - HTTP/HTML script written for the TesterGuruJi demo shop
 * (k6-ci-gate/app/server.js, http://localhost:3000). Teaching sample only:
 * it was written by hand in VuGen format, not recorded in LoadRunner.
 *
 * Runs once per virtual user, before the Action iterations.
 * Logs in and stores the session token and CSRF token for every later request.
 */

vuser_init()
{
	/* Target environment. Change here when pointing at another test system. */
	lr_save_string("http://localhost:3000", "pBaseUrl");

	web_set_max_html_param_len("1024");

	lr_start_transaction("01_Login");

	/* Correlation: the token values change on every login */
	web_reg_save_param_ex(
		"ParamName=cToken",
		"LB=\"token\":\"",
		"RB=\"",
		"Ordinal=1",
		SEARCH_FILTERS,
		"Scope=Body",
		LAST);

	web_reg_save_param_ex(
		"ParamName=cCsrf",
		"LB=\"csrfToken\":\"",
		"RB=\"",
		"Ordinal=1",
		SEARCH_FILTERS,
		"Scope=Body",
		LAST);

	web_reg_find("Text=\"token\"", "Fail=NotFound", LAST);

	web_custom_request("login",
		"URL={pBaseUrl}/api/login",
		"Method=POST",
		"Resource=0",
		"EncType=application/json",
		"Mode=HTTP",
		"Body={\"username\":\"{pUser}\",\"password\":\"{pPass}\"}",
		LAST);

	lr_end_transaction("01_Login", LR_AUTO);

	/* Send the session on every following request */
	web_add_auto_header("Authorization", "Bearer {cToken}");
	web_add_auto_header("X-CSRF-Token", "{cCsrf}");

	lr_output_message("Logged in as %s", lr_eval_string("{pUser}"));

	lr_think_time(2);

	return 0;
}
