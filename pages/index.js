import { Frame, Page, Layout, Card, DataTable, TextContainer, Heading, Link, TextField, Toast, Icon, FooterHelp } from '@shopify/polaris';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';
import Cookies from 'js-cookie';
import { EditMajorMonotone, LockMajorMonotone } from '@shopify/polaris-icons';
import { TrialBanner, Switch } from '@components';
import * as CONSTANTS from '@libs/constants';

class Index extends React.Component {
  state = {
    loading: true,
    saving: false,
    testing: false,
    trial: true,
    trialExpiration: 7,
    paid: false,
    connected: false,
    plan: CONSTANTS.SUBSCRIPTION.PLAN.TRIAL,
    settings: {},
    toast: CONSTANTS.TOAST.HIDDEN,
    toastMsg: ''
  };

  componentDidMount() {
    fetch('/api/settings')
      .then(response => response.json())
      .then(data => {
        if (!data.trial && !data.paid) {
          const app = createApp({
            apiKey: process.env.API_KEY,
            shopOrigin: Cookies.get('shopOrigin')
          });
          const redirect = Redirect.create(app);
          return redirect.dispatch(Redirect.Action.APP, '/subscription');
        }
        data['loading'] = false;
        this.setState(data);
      });
  }

  handleChange = (key, checked) => {
    var settings = this.state.settings;
    settings[key].enabled = checked;
    this.setState({ settings: settings });
  }

  handleStockLimitChange = (limit) => {
    limit = parseInt(limit);
    if (!limit)
      limit = 0;

    var settings = this.state.settings;
    settings.low_stock.limit = '' + limit;
    this.setState({ settings: settings });
  }

  handleSave = () => {
    this.setState({ saving: true });
    const notifications = this.state.settings;
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: notifications }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.result == CONSTANTS.STATUS.SUCCESS) {
          this.setState({
            toast: CONSTANTS.TOAST.SHOW,
            toastMsg: 'Settings updated successfully',
            saving: false
          });
        } else {
          this.setState({
            toast: CONSTANTS.TOAST.SHOW,
            toastMsg: 'Failed to update settings',
            saving: false
          });
        }
        setTimeout(() => {
          this.hideToast();
        }, 3000);
      });
  }

  sendTestNotification = () => {
    this.setState({ testing: true });
    fetch('/test')
      .then(response => response.json())
      .then(data => {
        console.log(data);
        if (data.result == CONSTANTS.STATUS.SUCCESS) {
          this.setState({
            toast: CONSTANTS.TOAST.SHOW,
            toastMsg: 'Notification was successfully sent',
            testing: false
          });
        } else {
          this.setState({
            toast: CONSTANTS.TOAST.SHOW,
            toastMsg: 'Failed to send notification',
            testing: false
          });
        }
        setTimeout(() => {
          this.hideToast();
        }, 3000);
      });
  }

  hideToast = () => {
    this.setState({ toast: CONSTANTS.TOAST.HIDDEN });
  }

  render() {
    if (this.state.loading) {
      return null;
    }
    if (this.state.connected) {
      var notifications = [];
      for (var key in this.state.settings) {
        var notification = [];
        if ((key == 'sales_report' || key == 'low_stock') &&
          (!this.state.paid || this.state.plan != CONSTANTS.SUBSCRIPTION.PLAN.PREMIUM)) {
          notification.push(<Icon source={LockMajorMonotone} />);
        } else {
          notification.push(
            <Switch
              handleChange={this.handleChange}
              stateKey={key}
              isEnabled={this.state.settings[key].enabled}
            />
          );
        }
        const keyUppercase = key.toUpperCase();
        notification.push(CONSTANTS.NOTIFICATION[keyUppercase].TITLE);
        if (key == 'low_stock' && this.state.paid && this.state.plan == CONSTANTS.SUBSCRIPTION.PLAN.PREMIUM) {
          notification.push(
            <div className="settings-container">
              <div className="description-container">{CONSTANTS.NOTIFICATION[keyUppercase].DESCRIPTION}</div>
              <TextField
                type="number"
                label="Stock limit:"
                value={this.state.settings.low_stock.limit}
                onChange={this.handleStockLimitChange}
                min="0"
              />
            </div>
          );
        } else {
          notification.push(<div className="description-container">{CONSTANTS.NOTIFICATION[keyUppercase].DESCRIPTION}</div>);
        }
        notifications.push(notification);
      }
      var toastMarkup = '';
      if (this.state.toast == CONSTANTS.TOAST.SHOW) {
        toastMarkup = (<Toast content={this.state.toastMsg} onDismiss={this.hideToast} />);
      }
      var footerHelpMarkup = (
        <FooterHelp>
          For any suggestions, questions, comments or problems just email us at{' '}
          <Link url="mailto:support@bellr.co" external>
            support@bellr.co
          </Link>
        </FooterHelp>
      );
      return (
        <Frame>
          <Page title="Settings">
            <Layout>
              <TrialBanner isTrial={this.state.trial} expiration={this.state.trialExpiration}></TrialBanner>
              <Layout.Section>
                <Card
                  primaryFooterAction={{
                    content: 'Save',
                    onAction: this.handleSave,
                    loading: this.state.saving
                  }}
                  secondaryFooterActions={[{
                    content: 'Send test notification',
                    onAction: this.sendTestNotification,
                    loading: this.state.testing
                  }]}
                  sectioned
                >
                  <DataTable
                    columnContentTypes={[]}
                    headings={['Status', 'Notification type', 'Description']}
                    rows={notifications}
                  />
                </Card>
              </Layout.Section>
            </Layout>
            {toastMarkup}
            {footerHelpMarkup}
          </Page>
        </Frame>
      );
    } else {
      return (
        <Page title="Welcome to Bellr!">
          <Layout sectioned>
            <TextContainer>
              <Heading>
                With Bellr, you can receive important order notifications, sales report and low stock notification sent straight to Slack.
                To get started, click the "Add to Slack" button below.
              </Heading>
              <p>
                <Link
                  url="https://slack.com/oauth/v2/authorize?client_id=1327331675796.1319331539525&scope=incoming-webhook&user_scope="
                  external>
                  <img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" />
                </Link>
              </p>
            </TextContainer>
          </Layout>
          {footerHelpMarkup}
        </Page>
      );
    }
  }
}

export default Index;