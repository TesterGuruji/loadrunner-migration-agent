/*
 * DemoShop_Checkout - vuser_end
 * Runs once per virtual user, after the last Action iteration.
 * The demo shop has no logout endpoint, so this only cleans up the
 * session headers and writes a log line.
 */

vuser_end()
{
	web_revert_auto_header("Authorization");
	web_revert_auto_header("X-CSRF-Token");

	lr_output_message("Vuser %s finished", lr_eval_string("{pUser}"));

	return 0;
}
