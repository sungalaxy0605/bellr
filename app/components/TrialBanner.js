import { Banner, Link, Layout } from '@shopify/polaris';

class TrialBanner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { showBanner: props.isTrial };
  }

  handleDismiss = () => {
    this.setState({ showBanner: false })
  }

  render() {
    const bannerMarkup = this.state.showBanner ? (
      <Layout.Section>
        <Banner onDismiss={this.handleDismiss} status="warning">
          <p>
            Your trial expires in {this.props.expiration} days.{' '}
            <Link url="/subscription">Upgrade Now!</Link>
          </p>
        </Banner>
      </Layout.Section>
    ) : null;
    return bannerMarkup;
  }
}

export default TrialBanner;